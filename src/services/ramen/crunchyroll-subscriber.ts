import { TextChannel, EmbedBuilder } from "discord.js";
import { client } from "../../core/client";
import { ramen } from "../../core/ramen";
import { logger } from "../../core/logger";
import type { FormattedEpisode } from "../../types/crunchyroll";
import { LANG_MAP, CRUNCHYROLL_COLOR, MESSAGE_DELAY } from "../../constants";

/**
 * Event data interface for new Crunchyroll episodes sent over the event bus.
 */
export interface CrunchyrollEpisodesEvent {
    episodes: {
        episode: FormattedEpisode;
        isEdited: boolean;
    }[];
    targetChannelIds: string[];
}

function buildEpisodeEmbed(episode: FormattedEpisode, isEdited: boolean): EmbedBuilder {
    const authorName = episode.publisher ? `${episode.publisher}` : "Crunchyroll New Video";

    const embed = new EmbedBuilder()
        .setColor(CRUNCHYROLL_COLOR)
        .setAuthor({
            name: authorName,
            iconURL: "https://www.crunchyroll.com/favicons/favicon-32x32.png"
        })
        .setTitle(episode.title)
        .setURL(episode.url)
        .setDescription(episode.description.slice(0, 200) + (episode.description.length > 200 ? "..." : ""))
        .setTimestamp(new Date(episode.releasedAt));

    // Add image (large)
    if (episode.thumbnail) {
        embed.setImage(episode.thumbnail);
    }

    // Add thumbnail (small) - Series poster (Anime Cover)
    if (episode.seriesPoster) {
        embed.setThumbnail(episode.seriesPoster);
    }

    // Episode info fields
    embed.addFields(
        {
            name: "Episode ID",
            value: `[${episode.episodeId}](${episode.url})`,
            inline: true
        },
        {
            name: "Season ID",
            value: `[${episode.seasonId}](https://www.crunchyroll.com/series/${episode.seriesId})`,
            inline: true
        },
        {
            name: "Series ID",
            value: `[${episode.seriesId}](https://www.crunchyroll.com/series/${episode.seriesId})`,
            inline: true
        },
        {
            name: "Version",
            value: LANG_MAP[episode.audioLocale] || episode.audioLocale,
            inline: true
        },
        {
            name: "IsDub",
            value: episode.isDub ? "true" : "false",
            inline: true
        },
        {
            name: "Duration",
            value: episode.duration,
            inline: true
        }
    );

    // External Links (2 Columns)
    if (episode.externalLinks) {
        const { mal, anilist } = episode.externalLinks;

        // MAL
        if (mal) {
            const isSearch = mal.includes("anime.php");
            const malLabel = isSearch ? "Search" : mal.split("/").filter(Boolean).pop() || "Link";
            embed.addFields({ name: "MAL", value: `[${malLabel}](${mal})`, inline: true });
        } else {
            embed.addFields({ name: "MAL", value: "-", inline: true });
        }

        // Anilist
        if (anilist) {
            const isSearch = anilist.includes("search");
            const anilistLabel = isSearch ? "Search" : anilist.split("/").filter(Boolean).pop() || "Link";
            embed.addFields({ name: "Anilist", value: `[${anilistLabel}](${anilist})`, inline: true });
        } else {
            embed.addFields({ name: "Anilist", value: "-", inline: true });
        }
    }

    // Subtitles
    embed.addFields({
        name: "Subtitles",
        value: episode.subtitles,
        inline: false
    });

    // Footer
    embed.setFooter({
        text: isEdited ? "📝 Edited · Long live CR!" : "Long live CR!"
    });

    return embed;
}

ramen.subscribe<CrunchyrollEpisodesEvent>("crunchyroll:new_episodes", async (data): Promise<void> => {
    try {
        const { episodes, targetChannelIds } = data;

        for (const channelId of targetChannelIds) {
            try {
                const channel =
                    client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
                if (channel && channel instanceof TextChannel) {
                    for (const { episode, isEdited } of episodes) {
                        const embed = buildEpisodeEmbed(episode, isEdited);
                        await channel.send({ embeds: [embed] });
                        await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY));
                    }
                }
            } catch (error: unknown) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger.error(err, `RAMEN: Failed to send crunchyroll embedded update to channel ${channelId}`);
            }
        }
    } catch (outerError: unknown) {
        const err = outerError instanceof Error ? outerError : new Error(String(outerError));
        logger.error(err, "RAMEN: Unexpected error in crunchyroll:new_episodes subscriber");
    }
});
logger.info("🍜 RAMEN Subscriber registered: crunchyroll:new_episodes");

import { buildLineupEmbed } from "../../commands/cr";

export interface CrunchyrollLineupEvent {
    announcements: {
        title: string;
        url: string;
        description: string;
        thumbnail: string | null;
        author: string | null;
        pubDate: string;
    }[];
    targetChannelIds: string[];
}

ramen.subscribe<CrunchyrollLineupEvent>("crunchyroll:new_lineup_announcement", async (data): Promise<void> => {
    try {
        const { announcements, targetChannelIds } = data;

        for (const channelId of targetChannelIds) {
            try {
                const channel =
                    client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
                if (channel && channel instanceof TextChannel) {
                    for (const announcement of announcements) {
                        const embed = buildLineupEmbed(announcement);
                        await channel.send({ embeds: [embed] });
                        await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY));
                    }
                }
            } catch (error: unknown) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger.error(err, `RAMEN: Failed to send crunchyroll lineup embed to channel ${channelId}`);
            }
        }
    } catch (outerError: unknown) {
        const err = outerError instanceof Error ? outerError : new Error(String(outerError));
        logger.error(err, "RAMEN: Unexpected error in crunchyroll:new_lineup_announcement subscriber");
    }
});
logger.info("🍜 RAMEN Subscriber registered: crunchyroll:new_lineup_announcement");
