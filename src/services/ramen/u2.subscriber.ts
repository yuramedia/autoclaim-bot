import { TextChannel, EmbedBuilder } from "discord.js";
import { client } from "../../core/client";
import { ramen } from "../../core/ramen";
import { logger } from "../../core/logger";
import type { FormattedU2Item } from "../../types/u2-feed";
import { U2_COLOR, U2_ICON } from "../../constants/u2-feed";

export interface U2Target {
    channelId: string;
    filter: string;
}

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
        .setURL(item.link || "https://u2.dmhy.org")
        .setTimestamp(item.pubDateUnix > 0 ? new Date(item.pubDateUnix * 1000) : item.pubDate);

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

ramen.subscribe<U2TorrentsEvent>("u2:new_torrents", async data => {
    const { items, targets } = data;

    for (const target of targets) {
        try {
            const channel = client.channels.cache.get(target.channelId);
            if (channel && channel instanceof TextChannel) {
                // Apply guild's filter regex
                const filterRegex = new RegExp(target.filter, "i");

                for (const item of items) {
                    if (!filterRegex.test(item.title)) continue;

                    const embed = buildItemEmbed(item);
                    const message = await channel.send({ embeds: [embed] });

                    // Cross-post if the channel is an announcement channel
                    try {
                        await message.crosspost();
                    } catch {
                        // Not an announcement channel or no permissions — ignore
                    }
                }
            }
        } catch (error) {
            logger.error(error as Error, `RAMEN: Failed to send U2 feed to channel ${target.channelId}`);
        }
    }
});

logger.info("🍜 RAMEN Subscriber registered: u2:new_torrents");
