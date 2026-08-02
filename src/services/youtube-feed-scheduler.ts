/**
 * YouTube Feed Scheduler
 * Periodically polls YouTube RSS feeds for subscribed channels and publishes new videos to RAMEN bus.
 */

import { Client } from "discord.js";
import { GuildSettings } from "../database/models/guild-settings";
import { YouTubeFeedService } from "./youtube-feed";
import { ramen } from "../core/ramen";
import {
    YT_POLL_INTERVAL,
    YT_MAX_ITEMS,
    YT_FETCH_CONCURRENCY,
    YT_CHANNEL_POLL_DELAY,
    YT_FIRST_RUN_MAX_AGE
} from "../constants/youtube-feed";
import { logger } from "../core/logger";
import type { FormattedYouTubeVideo, YouTubeFeedEntry, YouTubeVideoStatusType } from "../types/youtube-feed";

/** Map of channelId -> list of cached FormattedYouTubeVideo items */
const cachedChannelVideos: Map<string, FormattedYouTubeVideo[]> = new Map();
/** Tracks channel IDs that have completed their initial silent cache run */
const initializedChannels: Set<string> = new Set();
const ytLock = { isChecking: false };

/**
 * Check if two videos are equal (by videoId)
 * @param a First video
 * @param b Second video
 * @returns Whether the videos have the same videoId
 */
function videoEquals(a: FormattedYouTubeVideo, b: FormattedYouTubeVideo): boolean {
    return a.videoId === b.videoId;
}

/**
 * Run async tasks with a concurrency limit.
 * @param items Items to process
 * @param concurrency Maximum concurrent tasks
 * @param fn Async function to run for each item
 * @returns Results in the same order as input items
 */
async function batchWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
    const results: R[] = Array.from<R>({ length: items.length });
    let nextIndex = 0;

    async function worker(): Promise<void> {
        while (nextIndex < items.length) {
            const idx = nextIndex++;
            results[idx] = await fn(items[idx]!);
        }
    }

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
}

/**
 * Sleep for a given number of milliseconds.
 * @param ms Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check whether a video status is "stable" (no further transitions expected).
 * Stable statuses: "video" (regular upload), "members_only" (membership content).
 * Unstable statuses: "upcoming" (may go live), "live" (may end).
 * @param statusType The video status type
 * @returns Whether the status is stable
 */
function isStableStatus(statusType: YouTubeVideoStatusType): boolean {
    return statusType === "video";
}

/**
 * Starts the YouTube feed scheduler loop.
 * @param client Discord client instance
 */
export function startYouTubeFeed(client: Client): void {
    logger.info("🎥 Starting YouTube feed scheduler...");
    const service = new YouTubeFeedService();

    // Initial check after 5 seconds delay (shard-guarded)
    setTimeout(async () => {
        try {
            if (client.shard && client.shard.ids[0] !== 0) return;
            await checkAllFeeds(service);
        } catch (error) {
            logger.error(error, "YouTube Feed initial check failed:");
        }
    }, 5000);

    // Poll every 1 minute (YT_POLL_INTERVAL)
    setInterval(async () => {
        try {
            if (client.shard && client.shard.ids[0] !== 0) return;
            await checkAllFeeds(service);
        } catch (error) {
            logger.error(error, "YouTube Feed poll check failed:");
        }
    }, YT_POLL_INTERVAL);
}

/**
 * Event data interface for new YouTube videos sent over RAMEN bus.
 */
interface YouTubeNewVideosPayload {
    videos: FormattedYouTubeVideo[];
    targets: string[];
}

/**
 * Collect all active subscribed YouTube channels and poll their RSS feeds.
 */
async function checkAllFeeds(service: YouTubeFeedService): Promise<void> {
    if (ytLock.isChecking) {
        logger.info("🎥 Skipping YouTube feed check — previous run still in progress");
        return;
    }
    ytLock.isChecking = true;

    try {
        // Query database for all active guilds with YouTube feed enabled
        const guilds = await GuildSettings.find({
            "youtubeFeed.enabled": true,
            "youtubeFeed.channelId": { $ne: null },
            "youtubeFeed.youtubeChannels.0": { $exists: true }
        }).lean();

        if (!guilds || guilds.length === 0) {
            return;
        }

        // Build list of target Discord channels per subscribed YouTube channel ID
        // ytChannelId -> list of Discord target channelIds
        const channelToTargetsMap: Map<string, string[]> = new Map();
        const channelToRegionMap: Map<string, string> = new Map();
        const allYtChannelIds: Set<string> = new Set();

        for (const guild of guilds) {
            const discordChannelId = guild.youtubeFeed?.channelId;
            const ytChannels = guild.youtubeFeed?.youtubeChannels || [];

            if (!discordChannelId || ytChannels.length === 0) continue;

            for (const ytChan of ytChannels) {
                const ytId = ytChan.channelId;
                allYtChannelIds.add(ytId);

                // Keep the first region encountered — don't overwrite if already set
                if (ytChan.region && !channelToRegionMap.has(ytId)) {
                    channelToRegionMap.set(ytId, ytChan.region);
                }

                const existingTargets = channelToTargetsMap.get(ytId) || [];
                if (!existingTargets.includes(discordChannelId)) {
                    existingTargets.push(discordChannelId);
                }
                channelToTargetsMap.set(ytId, existingTargets);
            }
        }

        // Process each YouTube channel feed with staggered delays
        let channelIndex = 0;
        for (const ytChannelId of allYtChannelIds) {
            try {
                // Stagger requests between channels to avoid burst traffic
                if (channelIndex > 0) {
                    await sleep(YT_CHANNEL_POLL_DELAY);
                }
                channelIndex++;

                const region = channelToRegionMap.get(ytChannelId) || "ID";
                const rssEntries = await service.fetchFeed(ytChannelId);
                const webEntries = await service.fetchVideosFromWeb(ytChannelId, region);

                // Merge RSS & Web scraper entries uniquely by videoId
                // RSS entries are preferred (they have accurate published dates)
                const rawEntriesMap = new Map<string, YouTubeFeedEntry>();
                for (const item of rssEntries) {
                    rawEntriesMap.set(item.videoId, item);
                }
                for (const item of webEntries) {
                    if (!rawEntriesMap.has(item.videoId)) {
                        // Web-only entry: inherit channel name from RSS if available, use NOW as published
                        const enrichedItem = { ...item };
                        if (!enrichedItem.channelName && rssEntries.length > 0) {
                            enrichedItem.channelName = rssEntries[0]!.channelName;
                        }
                        if (!enrichedItem.published) {
                            enrichedItem.published = new Date().toISOString();
                        }
                        rawEntriesMap.set(item.videoId, enrichedItem);
                    }
                }
                const rawEntries = Array.from(rawEntriesMap.values());
                if (rawEntries.length === 0) continue;

                let channelCache = cachedChannelVideos.get(ytChannelId) || [];
                const isFirstCheckForChannel = !initializedChannels.has(ytChannelId);
                const nowUnix = Math.floor(Date.now() / 1000);

                const newlyDiscoveredVideos: FormattedYouTubeVideo[] = [];

                const channelIcon = await service.getChannelIcon(ytChannelId);

                // Determine which entries actually need a status fetch:
                // - New entries not in cache -> always fetch
                // - Cached entries with stable status ("video") -> skip
                // - Cached entries with unstable status ("upcoming", "live", "members_only") -> re-fetch
                const entriesToFetchStatus: { entry: YouTubeFeedEntry; index: number }[] = [];
                const skippedStatusResults: Map<
                    number,
                    { statusType: YouTubeVideoStatusType; scheduledStartTimeUnix: number | null }
                > = new Map();

                for (let i = 0; i < rawEntries.length; i++) {
                    const raw = rawEntries[i]!;
                    const existing = channelCache.find(v => v.videoId === raw.videoId);

                    if (existing && isStableStatus(existing.statusType)) {
                        // Skip status fetch — reuse cached stable status
                        skippedStatusResults.set(i, {
                            statusType: existing.statusType,
                            scheduledStartTimeUnix: existing.scheduledStartTimeUnix
                        });
                    } else {
                        entriesToFetchStatus.push({ entry: raw, index: i });
                    }
                }

                // Fetch video statuses with concurrency limit for entries that need it
                const fetchedStatuses = await batchWithConcurrency(
                    entriesToFetchStatus,
                    YT_FETCH_CONCURRENCY,
                    async ({ entry }) => service.fetchVideoStatus(entry.videoId)
                );

                // Rebuild full status results array
                const statusResults: {
                    statusType: YouTubeVideoStatusType;
                    scheduledStartTimeUnix: number | null;
                    realTitle?: string;
                }[] = Array.from({ length: rawEntries.length });

                for (const [idx, result] of skippedStatusResults) {
                    statusResults[idx] = result;
                }
                for (let i = 0; i < entriesToFetchStatus.length; i++) {
                    statusResults[entriesToFetchStatus[i]!.index] = fetchedStatuses[i]!;
                }

                for (let i = 0; i < rawEntries.length; i++) {
                    const raw = rawEntries[i];
                    const statusInfo = statusResults[i];
                    if (!raw || !statusInfo) continue;
                    try {
                        const formatted = service.formatEntry(raw, statusInfo, channelIcon);
                        const existing = channelCache.find(v => videoEquals(v, formatted));

                        if (existing) {
                            // Check if status transitioned to a different state
                            const previousStatus = existing.lastPostedStatus || existing.statusType;
                            const newStatus = statusInfo.statusType;

                            if (previousStatus !== newStatus) {
                                // Status changed — update cache entry
                                existing.statusType = newStatus;
                                existing.scheduledStartTimeUnix = statusInfo.scheduledStartTimeUnix;
                                existing.lastPostedStatus = newStatus;

                                // Update title if a real title was fetched
                                if (statusInfo.realTitle) {
                                    existing.title = statusInfo.realTitle;
                                }

                                // Notify Discord about the transition
                                if (!isFirstCheckForChannel) {
                                    newlyDiscoveredVideos.push({
                                        ...existing,
                                        wasPosted: false
                                    });
                                }
                            }
                            continue;
                        }

                        // New item — set lastPostedStatus for future transition tracking
                        formatted.lastPostedStatus = formatted.statusType;

                        if (isFirstCheckForChannel) {
                            // First run: Skip videos older than 24h for silent cache
                            const videoAgeSeconds = nowUnix - formatted.publishedUnix;
                            const isOld = videoAgeSeconds > YT_FIRST_RUN_MAX_AGE;
                            const isTimeSensitive =
                                formatted.statusType === "upcoming" ||
                                formatted.statusType === "live" ||
                                formatted.statusType === "members_only";

                            if (isOld && !isTimeSensitive) {
                                // Old regular video — cache silently
                                formatted.wasPosted = true;
                            }
                            // Time-sensitive items (upcoming/live/members) are cached with wasPosted = false
                            // They will be posted in postNewVideos() below
                        }

                        channelCache.push(formatted);

                        if (!isFirstCheckForChannel) {
                            // Not first run — all new items should be posted
                            newlyDiscoveredVideos.push(formatted);
                        }
                    } catch (err) {
                        logger.error(err, `Error formatting YouTube video for ${ytChannelId}:`);
                    }
                }

                // Sort cache by publication date descending and cap size
                channelCache.sort((a, b) => b.publishedUnix - a.publishedUnix);
                if (channelCache.length > YT_MAX_ITEMS) {
                    channelCache = channelCache.slice(0, YT_MAX_ITEMS);
                }
                cachedChannelVideos.set(ytChannelId, channelCache);

                if (isFirstCheckForChannel) {
                    initializedChannels.add(ytChannelId);
                    logger.info(
                        `🎥 Cached ${channelCache.length} YouTube videos for channel ${ytChannelId} (silent init)`
                    );

                    // Post time-sensitive videos discovered on first run (upcoming/live/members)
                    const timeSensitiveVideos = channelCache.filter(
                        v =>
                            !v.wasPosted &&
                            (v.statusType === "upcoming" || v.statusType === "live" || v.statusType === "members_only")
                    );

                    if (timeSensitiveVideos.length > 0) {
                        const targets = channelToTargetsMap.get(ytChannelId) || [];
                        if (targets.length > 0) {
                            postNewVideos(timeSensitiveVideos, targets);
                        }
                    }
                    continue;
                }

                // Post new videos on subsequent checks
                const targets = channelToTargetsMap.get(ytChannelId) || [];
                const unpostedNewVideos = newlyDiscoveredVideos.filter(v => !v.wasPosted);
                if (unpostedNewVideos.length > 0 && targets.length > 0) {
                    postNewVideos(unpostedNewVideos, targets);
                }
            } catch (chanError) {
                logger.error(chanError, `Error processing YouTube channel ${ytChannelId}:`);
            }
        }

        // Memory optimization: Prune cached channels that are no longer subscribed by any active guild
        for (const cachedId of cachedChannelVideos.keys()) {
            if (!allYtChannelIds.has(cachedId)) {
                cachedChannelVideos.delete(cachedId);
                initializedChannels.delete(cachedId);
            }
        }
    } catch (error) {
        logger.error(error, "Error in YouTube feed checkAllFeeds:");
    } finally {
        ytLock.isChecking = false;
    }
}

/**
 * Publish unposted videos to subscribed Discord channels via RAMEN bus.
 * Matches the U2 scheduler's postNewItems() pattern for consistency.
 * @param videos Array of unposted FormattedYouTubeVideo items
 * @param targets Array of Discord channel IDs to send to
 */
function postNewVideos(videos: FormattedYouTubeVideo[], targets: string[]): void {
    const payload: YouTubeNewVideosPayload = {
        videos,
        targets
    };

    ramen.publish("youtube:new_videos", payload);

    for (const video of videos) {
        video.wasPosted = true;
    }

    logger.info(`🎥 Published ${videos.length} new YouTube video(s) to ${targets.length} Discord channel(s)`);
}
