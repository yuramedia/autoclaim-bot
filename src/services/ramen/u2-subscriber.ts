import { ChannelType, EmbedBuilder } from "discord.js";
import { client } from "../../core/client";
import { ramen } from "../../core/ramen";
import { logger } from "../../core/logger";
import { isSafeRegex } from "../u2-feed";
import type { FormattedU2Item } from "../../types/u2-feed";
import { U2_COLOR, U2_ICON } from "../../constants/u2-feed";

const CHANNEL_CONCURRENCY = 5;

/**
 * Interface representing target channel and filter settings for U2 feed alerts.
 */
export interface U2Target {
    channelId: string;
    filter: string;
}

/**
 * Event data interface for new U2 torrents sent over the event bus.
 */
export interface U2TorrentsEvent {
    items: FormattedU2Item[];
    targets: U2Target[];
}

function buildItemEmbed(item: FormattedU2Item): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(U2_COLOR)
        .setAuthor({
            name: "U2",
            url: "https://u2.dmhy.org",
            iconURL: U2_ICON
        })
        .setTitle(item.title.length > 256 ? item.title.substring(0, 250) + "..." : item.title)
        .setURL(item.link || "https://u2.dmhy.org");

    const ts = item.pubDateUnix > 0 ? new Date(item.pubDateUnix * 1000) : item.pubDate;
    embed.setTimestamp(!isNaN(ts.getTime()) ? ts : new Date());

    if (item.image) {
        embed.setImage(item.image);
    }

    embed.addFields(
        {
            name: "Category",
            value: item.category || "-",
            inline: true
        },
        {
            name: "Size",
            value: item.size || "Unknown",
            inline: true
        },
        {
            name: "Uploader",
            value: item.uploader || "Unknown",
            inline: true
        }
    );

    embed.setFooter({ text: "U2 BDMV" });

    return embed;
}

async function sendU2Target(target: U2Target, items: FormattedU2Item[]): Promise<void> {
    try {
        // When sharded, only handle channels owned (cached) by this shard to prevent duplicates.
        const channel = client.shard
            ? client.channels.cache.get(target.channelId)
            : (client.channels.cache.get(target.channelId) ??
              (await client.channels.fetch(target.channelId).catch(() => null)));

        if (!channel || (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement)) {
            return;
        }

        let filterRegex: RegExp | null = null;
        if (isSafeRegex(target.filter)) {
            try {
                filterRegex = new RegExp(target.filter, "i");
            } catch {
                filterRegex = null;
            }
        }

        for (const item of items) {
            if (filterRegex) {
                if (!filterRegex.test(item.title)) continue;
            } else if (!item.title.toLowerCase().includes(target.filter.toLowerCase())) {
                continue;
            }

            const embed = buildItemEmbed(item);
            const message = await channel.send({ embeds: [embed] });
            if (channel.type === ChannelType.GuildAnnouncement) {
                await message.crosspost().catch(() => {});
            }
        }
    } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.error(err, `RAMEN: Failed to send U2 feed to channel ${target.channelId}`);
    }
}

ramen.subscribe<U2TorrentsEvent>("u2:new_torrents", async (data): Promise<void> => {
    try {
        const { items, targets } = data;
        for (let i = 0; i < targets.length; i += CHANNEL_CONCURRENCY) {
            const batch = targets.slice(i, i + CHANNEL_CONCURRENCY);
            await Promise.all(batch.map(target => sendU2Target(target, items)));
        }
    } catch (outerError: unknown) {
        const err = outerError instanceof Error ? outerError : new Error(String(outerError));
        logger.error(err, "RAMEN: Unexpected error in u2:new_torrents subscriber");
    }
});

logger.info("🍜 RAMEN Subscriber registered: u2:new_torrents");
