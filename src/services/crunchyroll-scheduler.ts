/**
 * Crunchyroll Feed Scheduler
 * Polls for new episodes and sends Discord notifications
 */

import { Client } from "discord.js";
import { GuildSettings } from "../database/models/GuildSettings";
import { CrunchyrollService } from "./crunchyroll";
import { ramen } from "../core/ramen";
import {
    CRUNCHYROLL_POLL_INTERVAL,
    MAX_SEEN_EPISODES,
    MAX_EPISODES_PER_CYCLE,
    seenEpisodes,
    feedLock
} from "../constants";
import { searchAnime } from "./anime-metadata";
import type { FormattedEpisode } from "../types/crunchyroll";

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

    // Poll every 5 minutes
    setInterval(async () => {
        // Only run on Shard 0 to prevent duplicates
        if (client.shard && client.shard.ids[0] !== 0) {
            return;
        }

        // Skip if a previous check is still running
        if (feedLock.isChecking) {
            console.log("📺 Skipping feed check — previous run still in progress");
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
    feedLock.isChecking = true;
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
                const metadata = await searchAnime(ep.seriesTitle);
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

        // Get all guilds with Crunchyroll feed enabled to extract channel IDs
        const guilds = await GuildSettings.find({
            "crunchyrollFeed.enabled": true,
            "crunchyrollFeed.channelId": { $ne: null }
        });

        if (guilds.length === 0) return;

        const targetChannelIds = guilds.map(g => g.crunchyrollFeed.channelId!);

        // Publish to RAMEN Bus instead of sending directly
        for (const episode of enrichedEpisodes.slice(0, MAX_EPISODES_PER_CYCLE)) {
            const isEdited = editedSet.has(episode.episodeId);
            ramen.publish("crunchyroll:new_episode", {
                episode,
                isEdited,
                targetChannelIds
            });
        }
    } catch (error) {
        console.error("Crunchyroll feed check error:", error);
    } finally {
        feedLock.isChecking = false;
    }
}
