/**
 * Crunchyroll Feed Scheduler
 * Polls for new episodes and sends Discord notifications
 */

import { Client } from "discord.js";
import { logger } from "../core/logger";
import { GuildSettings } from "../database/models/guild-settings";
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

/**
 * Start the Crunchyroll feed scheduler.
 * Polls Crunchyroll for new episodes at regular intervals and publishes them to the RAMEN bus.
 * @param client - Discord client instance.
 */
export function startCrunchyrollFeed(client: Client): void {
    logger.info("📺 Starting Crunchyroll feed scheduler...");

    const service = new CrunchyrollService();

    // Initial fetch to populate cache
    initializeCache(service);

    // Poll every interval
    setInterval(async () => {
        try {
            // Only run on Shard 0 to prevent duplicates
            if (client.shard && client.shard.ids[0] !== 0) {
                return;
            }

            // Skip if a previous check is still running
            if (feedLock.isChecking) {
                logger.info("📺 Skipping feed check — previous run still in progress");
                return;
            }

            await checkForNewEpisodes(client, service);
        } catch (error) {
            logger.error(error as Error, "Error in Crunchyroll feed poll");
        }
    }, CRUNCHYROLL_POLL_INTERVAL);
}

async function initializeCache(service: CrunchyrollService): Promise<void> {
    try {
        logger.info("📺 Initializing Crunchyroll episode cache from Browser Endpoint (Global)...");
        const episodes = await service.fetchLatestEpisodes("", 100);

        for (const ep of episodes) {
            seenEpisodes.set(ep.id, ep.title);
        }
        pruneSeenEpisodes();

        logger.info(`📺 Cached ${seenEpisodes.size} episodes`);
    } catch (error) {
        logger.error(error as Error, "Failed to initialize Crunchyroll cache");
    } finally {
        // Always transition out of first-run mode, even on failure.
        // If init fails, the next successful poll will treat all items as new
        // — better than staying permanently silent.
        isFirstRun = false;
    }
}

async function checkForNewEpisodes(client: Client, service: CrunchyrollService): Promise<void> {
    feedLock.isChecking = true;
    try {
        const episodes = await service.fetchLatestEpisodes("", 50);
        if (episodes.length === 0) return;

        // Fetch RSS publishers for enrichment (original)
        await service.fetchRssPublishers();

        // Find new or edited episodes — but don't mark them as seen until after publish
        const pendingSeen: Map<string, string> = new Map(); // id → title, to be committed after publish
        const newEpisodes: { episode: FormattedEpisode; isEdited: boolean }[] = [];
        for (const ep of episodes) {
            const prevTitle = seenEpisodes.get(ep.id);

            if (prevTitle === undefined) {
                // New episode — defer marking as seen until after successful publish
                pendingSeen.set(ep.id, ep.title);
                if (!isFirstRun) {
                    const formatted = service.formatEpisode(ep);
                    formatted.publisher = service.getPublisher(ep.external_id);
                    newEpisodes.push({ episode: formatted, isEdited: false });
                }
            } else if (prevTitle !== ep.title) {
                // Edited episode (title changed) — defer marking as seen until after successful publish
                pendingSeen.set(ep.id, ep.title);
                if (!isFirstRun) {
                    logger.info(`📺 Detected edit on ${ep.id}`);
                    const formatted = service.formatEpisode(ep);
                    formatted.publisher = service.getPublisher(ep.external_id);
                    newEpisodes.push({ episode: formatted, isEdited: true });
                }
            }
        }

        if (newEpisodes.length === 0) {
            // No new episodes — commit pending seen entries for first-run items
            for (const [id, title] of pendingSeen) {
                seenEpisodes.set(id, title);
            }
            pruneSeenEpisodes();
            return;
        }

        // Enrich with series posters
        const rawEpisodes = newEpisodes.map(e => e.episode);
        const enrichedEpisodes = await service.enrichWithSeriesPoster(rawEpisodes);

        logger.info(`📺 Found ${enrichedEpisodes.length} new/edited Crunchyroll episode(s)`);

        // Enrich with Metadata (MAL/Anilist/AniDB) with concurrency control
        // Process in batches of 10 to avoid overwhelming the API
        const BATCH_SIZE = 10;
        for (let i = 0; i < enrichedEpisodes.length; i += BATCH_SIZE) {
            const batch = enrichedEpisodes.slice(i, i + BATCH_SIZE);
            await Promise.all(
                batch.map(async ep => {
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
                        logger.error(e as Error, `Error enriching metadata for ${ep.seriesTitle}`);
                    }
                })
            );
        }

        // Build edit lookup from newEpisodes
        const editedSet = new Set(newEpisodes.filter(e => e.isEdited).map(e => e.episode.episodeId));

        // Get all guilds with Crunchyroll feed enabled to extract channel IDs
        const guilds = await GuildSettings.find({
            "crunchyrollFeed.enabled": true,
            "crunchyrollFeed.channelId": { $ne: null }
        }).lean();

        if (guilds.length === 0) return;

        const targetChannelIds = guilds.map(g => g.crunchyrollFeed.channelId!);

        // Publish to RAMEN Bus as a batch to respect message delays in the subscriber
        const episodesToPublish = enrichedEpisodes.slice(0, MAX_EPISODES_PER_CYCLE).map(ep => ({
            episode: ep,
            isEdited: editedSet.has(ep.episodeId)
        }));

        if (episodesToPublish.length > 0) {
            ramen.publish("crunchyroll:new_episodes", {
                episodes: episodesToPublish,
                targetChannelIds
            });

            // Commit seen episodes only after successful publish
            for (const [id, title] of pendingSeen) {
                seenEpisodes.set(id, title);
            }
        }

        pruneSeenEpisodes();
    } catch (error) {
        logger.error(error as Error, "Crunchyroll feed check error");
    } finally {
        feedLock.isChecking = false;
    }
}
