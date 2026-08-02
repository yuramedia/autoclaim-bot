/**
 * YouTube Feed Scheduler
 * Periodically polls YouTube RSS feeds for subscribed channels and publishes new videos to RAMEN bus.
 */

import { Client } from "discord.js";
import { GuildSettings } from "../database/models/guild-settings";
import { YouTubeFeedService } from "./youtube-feed";
import { ramen } from "../core/ramen";
import { YT_POLL_INTERVAL, YT_MAX_ITEMS } from "../constants/youtube-feed";
import { logger } from "../core/logger";
import type { FormattedYouTubeVideo, YouTubeFeedEntry } from "../types/youtube-feed";

/** Map of channelId -> list of cached FormattedYouTubeVideo items */
const cachedChannelVideos: Map<string, FormattedYouTubeVideo[]> = new Map();
/** Tracks channel IDs that have completed their initial silent cache run */
const initializedChannels: Set<string> = new Set();
const ytLock = { isChecking: false };

/**
 * Check if two videos are equal (by videoId)
 */
function videoEquals(a: FormattedYouTubeVideo, b: FormattedYouTubeVideo): boolean {
    return a.videoId === b.videoId;
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
                if (ytChan.region) {
                    channelToRegionMap.set(ytId, ytChan.region);
                }

                const existingTargets = channelToTargetsMap.get(ytId) || [];
                if (!existingTargets.includes(discordChannelId)) {
                    existingTargets.push(discordChannelId);
                }
                channelToTargetsMap.set(ytId, existingTargets);
            }
        }

        // Process each YouTube channel feed
        for (const ytChannelId of allYtChannelIds) {
            try {
                const region = channelToRegionMap.get(ytChannelId) || "ID";
                const rssEntries = await service.fetchFeed(ytChannelId);
                const webEntries = await service.fetchVideosFromWeb(ytChannelId, region);

                // Merge RSS & Web scraper entries uniquely by videoId
                const rawEntriesMap = new Map<string, YouTubeFeedEntry>();
                for (const item of rssEntries) {
                    rawEntriesMap.set(item.videoId, item);
                }
                for (const item of webEntries) {
                    if (!rawEntriesMap.has(item.videoId)) {
                        rawEntriesMap.set(item.videoId, item);
                    }
                }
                const rawEntries = Array.from(rawEntriesMap.values());
                if (rawEntries.length === 0) continue;

                let channelCache = cachedChannelVideos.get(ytChannelId) || [];
                const isFirstCheckForChannel = !initializedChannels.has(ytChannelId);

                const newlyDiscoveredVideos: FormattedYouTubeVideo[] = [];

                const channelIcon = await service.getChannelIcon(ytChannelId);

                for (const raw of rawEntries) {
                    try {
                        const statusInfo = await service.fetchVideoStatus(raw.videoId);
                        const formatted = service.formatEntry(raw, statusInfo, channelIcon);
                        const existing = channelCache.find(v => videoEquals(v, formatted));

                        if (existing) {
                            // Check if status transitioned (e.g. from "upcoming" -> "live" or "video")
                            if (existing.lastPostedStatus === "upcoming" && statusInfo.statusType !== "upcoming") {
                                existing.statusType = statusInfo.statusType;
                                existing.scheduledStartTimeUnix = statusInfo.scheduledStartTimeUnix;
                                existing.lastPostedStatus = statusInfo.statusType;

                                // Trigger transition update notification to Discord
                                if (!isFirstCheckForChannel) {
                                    newlyDiscoveredVideos.push({
                                        ...existing,
                                        wasPosted: false
                                    });
                                }
                            }
                            continue;
                        }

                        // New item
                        formatted.lastPostedStatus = formatted.statusType;
                        if (isFirstCheckForChannel) {
                            formatted.wasPosted = true;
                        }
                        channelCache.push(formatted);
                        if (!isFirstCheckForChannel) {
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
                    continue;
                }

                // If new videos were found, post to target Discord channels via RAMEN
                const unpostedNewVideos = newlyDiscoveredVideos.filter(v => !v.wasPosted);
                const targetDiscordChannels = channelToTargetsMap.get(ytChannelId) || [];

                if (unpostedNewVideos.length > 0 && targetDiscordChannels.length > 0) {
                    ramen.publish("youtube:new_videos", {
                        videos: unpostedNewVideos,
                        targets: targetDiscordChannels
                    });

                    for (const video of unpostedNewVideos) {
                        video.wasPosted = true;
                    }
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
