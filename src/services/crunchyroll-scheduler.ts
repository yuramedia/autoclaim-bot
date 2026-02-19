/**
 * Crunchyroll Feed Scheduler
 * Polls for new episodes and sends Discord notifications
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { GuildSettings } from "../database/models/GuildSettings";
import { CrunchyrollService } from "./crunchyroll";
import { LANG_MAP, CRUNCHYROLL_COLOR, CRUNCHYROLL_POLL_INTERVAL } from "../constants";
import { AnimeMetadataService } from "./anime-metadata";
import type { FormattedEpisode } from "../types/crunchyroll";

// Cache of last seen episode IDs (in-memory, capped to prevent memory leak)
const MAX_SEEN_EPISODES = 500;
/** Map of episode id -> title for tracking edits */
const seenEpisodes = new Map<string, string>();
let isFirstRun = true;

/** Prune oldest entries when the map exceeds MAX_SEEN_EPISODES */
function pruneSeenEpisodes(): void {
    if (seenEpisodes.size <= MAX_SEEN_EPISODES) return;
    const excess = seenEpisodes.size - MAX_SEEN_EPISODES;
    let removed = 0;
    for (const key of seenEpisodes.keys()) {
        if (removed >= excess) break;
        seenEpisodes.delete(key);
        removed++;
    }
}

export function startCrunchyrollFeed(client: Client): void {
    console.log("📺 Starting Crunchyroll feed scheduler...");

    const service = new CrunchyrollService();

    // Initial fetch to populate cache
    initializeCache(service);

    // Poll every 5 minute
    setInterval(async () => {
        // Only run on Shard 0 to prevent duplicates
        if (client.shard && client.shard.ids[0] !== 0) {
            return;
        }

        await checkForNewEpisodes(client, service);
    }, CRUNCHYROLL_POLL_INTERVAL);
}

async function initializeCache(service: CrunchyrollService): Promise<void> {
    try {
        console.log("📺 Initializing Crunchyroll episode cache...");
        const episodes = await service.fetchLatestEpisodes("en-US", 100);

        for (const ep of episodes) {
            seenEpisodes.set(ep.id, ep.title);
        }
        pruneSeenEpisodes();

        console.log(`📺 Cached ${seenEpisodes.size} episodes`);
        isFirstRun = false;
    } catch (error) {
        console.error("Failed to initialize Crunchyroll cache:", error);
    }
}

async function checkForNewEpisodes(client: Client, service: CrunchyrollService): Promise<void> {
    try {
        const episodes = await service.fetchLatestEpisodes("en-US", 50);
        if (episodes.length === 0) return;

        // Fetch RSS publishers for enrichment
        await service.fetchRssPublishers();

        // Find new or edited episodes
        const newEpisodes: { episode: FormattedEpisode; isEdited: boolean }[] = [];
        for (const ep of episodes) {
            const prevTitle = seenEpisodes.get(ep.id);

            if (prevTitle === undefined) {
                // New episode
                seenEpisodes.set(ep.id, ep.title);
                if (!isFirstRun) {
                    const formatted = service.formatEpisode(ep);
                    formatted.publisher = service.getPublisher(ep.external_id);
                    newEpisodes.push({ episode: formatted, isEdited: false });
                }
            } else if (prevTitle !== ep.title) {
                // Edited episode (title changed)
                seenEpisodes.set(ep.id, ep.title);
                if (!isFirstRun) {
                    console.log(`📺 Detected edit on ${ep.id}`);
                    const formatted = service.formatEpisode(ep);
                    formatted.publisher = service.getPublisher(ep.external_id);
                    newEpisodes.push({ episode: formatted, isEdited: true });
                }
            }
        }
        pruneSeenEpisodes();

        if (newEpisodes.length === 0) return;

        // Enrich with series posters
        const rawEpisodes = newEpisodes.map(e => e.episode);
        const enrichedEpisodes = await service.enrichWithSeriesPoster(rawEpisodes);

        console.log(`📺 Found ${enrichedEpisodes.length} new/edited Crunchyroll episode(s)`);

        // Enrich with Metadata (MAL/Anilist/AniDB)
        for (const ep of enrichedEpisodes) {
            try {
                const metadata = await AnimeMetadataService.searchAnime(ep.seriesTitle);
                if (metadata) {
                    ep.externalLinks = {
                        anilist: metadata.siteUrl || `https://anilist.co/anime/${metadata.id}`,
                        mal: metadata.idMal ? `https://myanimelist.net/anime/${metadata.idMal}` : undefined
                    };
                } else {
                    ep.externalLinks = {
                        anilist: `https://anilist.co/search/anime?search=${encodeURIComponent(ep.seriesTitle)}`,
                        mal: `https://myanimelist.net/anime.php?q=${encodeURIComponent(ep.seriesTitle)}`
                    };
                }
            } catch (e) {
                console.error(`Error enriching metadata for ${ep.seriesTitle}:`, e);
            }
        }

        // Build edit lookup from newEpisodes
        const editedSet = new Set(newEpisodes.filter(e => e.isEdited).map(e => e.episode.episodeId));

        // Get all guilds with Crunchyroll feed enabled
        const guilds = await GuildSettings.find({
            "crunchyrollFeed.enabled": true,
            "crunchyrollFeed.channelId": { $ne: null }
        });

        if (guilds.length === 0) return;

        // Send notifications to each guild
        for (const guild of guilds) {
            try {
                const channel = await client.channels.fetch(guild.crunchyrollFeed.channelId!);
                if (!channel || !(channel instanceof TextChannel)) continue;

                // Send each new episode (limit to 10 per cycle to avoid spam)
                for (const episode of enrichedEpisodes.slice(0, 10)) {
                    const isEdited = editedSet.has(episode.episodeId);
                    const embed = buildEpisodeEmbed(episode, isEdited);
                    await channel.send({ embeds: [embed] });

                    // Small delay between messages
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Failed to send to guild ${guild.guildId}:`, error);
            }
        }
    } catch (error) {
        console.error("Crunchyroll feed check error:", error);
    }
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
        .setTimestamp(episode.releasedAt);

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
            // Extract ID from URL for display if possible, else "Link"
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
