import { TextChannel, EmbedBuilder } from "discord.js";
import { client } from "../../core/client";
import { ramen } from "../../core/ramen";
import type { FormattedEpisode } from "../../types/crunchyroll";
import { LANG_MAP, CRUNCHYROLL_COLOR, MESSAGE_DELAY } from "../../constants";

export interface CrunchyrollEpisodeEvent {
    episode: FormattedEpisode;
    isEdited: boolean;
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

    // Add thumbnail and image
    if (episode.seriesPoster) {
        embed.setThumbnail(episode.seriesPoster);
    }
    if (episode.thumbnail) {
        embed.setImage(episode.thumbnail);
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
            const malId = mal.split("/").pop() || "Link";
            embed.addFields({ name: "MAL", value: `[${malId}](${mal})`, inline: true });
        } else {
            embed.addFields({ name: "MAL", value: "-", inline: true });
        }

        // Anilist
        if (anilist) {
            const anilistId = anilist.split("/").pop() || "Link";
            embed.addFields({ name: "Anilist", value: `[${anilistId}](${anilist})`, inline: true });
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
        text: isEdited ? "📝 Edited · Hidup CR!" : "Hidup CR!"
    });

    return embed;
}

ramen.subscribe<CrunchyrollEpisodeEvent>("crunchyroll:new_episode", async data => {
    const { episode, isEdited, targetChannelIds } = data;
    const embed = buildEpisodeEmbed(episode, isEdited);

    // Iterate through given channels and see if this shard manages them
    for (const channelId of targetChannelIds) {
        try {
            // Using cache.get() ensures we only send if the channel exists on THIS shard.
            // This prevents duplicate messages or the need for cross-shard .fetch()
            const channel = client.channels.cache.get(channelId);
            if (channel && channel instanceof TextChannel) {
                await channel.send({ embeds: [embed] });
                await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY));
            }
        } catch (error) {
            console.error(`RAMEN: Failed to send crunchyroll embedded update to channel ${channelId}:`, error);
        }
    }
});
console.log("🍜 RAMEN Subscriber registered: crunchyroll:new_episode");
