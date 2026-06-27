import { TextChannel, EmbedBuilder } from "discord.js";
import { client } from "../../core/client";
import { ramen } from "../../core/ramen";
import { logger } from "../../core/logger";
import type { FormattedU2Item } from "../../types/u2-feed";
import { U2_COLOR, U2_ICON } from "../../constants/u2-feed";

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

/**
 * Check if a regex pattern is safe to execute (prevents ReDoS).
 * Rejects patterns that are too long or contain nested quantifiers like (a+)+.
 * @param pattern - The regex pattern string to validate.
 * @returns True if the pattern is considered safe.
 */
function isSafeRegex(pattern: string): boolean {
    // Reject overly long patterns
    if (pattern.length > 200) return false;
    // Reject nested quantifiers: (…+)+, (…*)+, (…+)*, (…*)*, etc.
    // Simplified check — catches the most common dangerous patterns.
    const nestedQuantifier = /\([^)]*[+*][^)]*\)[+*]/;
    if (nestedQuantifier.test(pattern)) return false;
    return true;
}

ramen.subscribe<U2TorrentsEvent>("u2:new_torrents", async (data): Promise<void> => {
    try {
        const { items, targets } = data;

        for (const target of targets) {
            try {
                const channel = client.channels.cache.get(target.channelId);
                if (channel && channel instanceof TextChannel) {
                    // Apply guild's filter — use regex only if pattern is safe,
                    // otherwise fall back to simple string matching to prevent ReDoS.
                    const useRegex = isSafeRegex(target.filter);
                    const filterRegex = useRegex ? new RegExp(target.filter, "i") : null;

                    for (const item of items) {
                        if (filterRegex) {
                            if (!filterRegex.test(item.title)) continue;
                        } else {
                            // Fallback: simple case-insensitive substring match
                            if (!item.title.toLowerCase().includes(target.filter.toLowerCase())) continue;
                        }

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
            } catch (error: unknown) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger.error(err, `RAMEN: Failed to send U2 feed to channel ${target.channelId}`);
            }
        }
    } catch (outerError: unknown) {
        const err = outerError instanceof Error ? outerError : new Error(String(outerError));
        logger.error(err, "RAMEN: Unexpected error in u2:new_torrents subscriber");
    }
});

logger.info("🍜 RAMEN Subscriber registered: u2:new_torrents");
