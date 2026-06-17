/**
 * Crunchyroll Lineup Feed Scheduler
 * Polls for new seasonal lineup announcements and broadcasts them
 */

import { Client } from "discord.js";
import { logger } from "../core/logger";
import { GuildSettings } from "../database/models/guild-settings";
import { CrunchyrollService } from "./crunchyroll";
import { ramen } from "../core/ramen";
import type { LineupAnnouncement } from "../types";

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes
const seenLineups = new Set<string>();
const lock = { isChecking: false };
let isFirstRun = true;

const service = new CrunchyrollService();

/**
 * Start the Crunchyroll lineup feed scheduler.
 * Polls Crunchyroll for new lineup announcements at regular intervals.
 * @param client - Discord client instance.
 */
export function startCrunchyrollLineupFeed(client: Client): void {
    logger.info("📺 Starting Crunchyroll lineup feed scheduler...");

    // Initial fetch to populate cache
    initializeCache();

    // Poll every interval
    setInterval(async () => {
        try {
            // Only run on Shard 0 to prevent duplicates
            if (client.shard && client.shard.ids[0] !== 0) {
                return;
            }

            // Skip if a previous check is still running
            if (lock.isChecking) {
                logger.info("📺 Skipping lineup check — previous run still in progress");
                return;
            }

            await checkForNewAnnouncements();
        } catch (error) {
            logger.error(error as Error, "Error in Crunchyroll lineup feed poll");
        }
    }, POLL_INTERVAL);
}

async function initializeCache(): Promise<void> {
    try {
        logger.info("📺 Initializing Crunchyroll lineup cache...");
        const announcements = await service.fetchLineupAnnouncements(true);

        for (const item of announcements) {
            seenLineups.add(item.url);
        }

        logger.info(`📺 Cached ${seenLineups.size} lineup URLs`);
        isFirstRun = false;
    } catch (error) {
        logger.error(error as Error, "Failed to initialize Crunchyroll lineup cache");
    }
}

async function checkForNewAnnouncements(): Promise<void> {
    lock.isChecking = true;
    try {
        const announcements = await service.fetchLineupAnnouncements(true);
        if (announcements.length === 0) return;

        const newAnnouncements: LineupAnnouncement[] = [];

        for (const item of announcements) {
            if (!seenLineups.has(item.url)) {
                seenLineups.add(item.url);
                if (!isFirstRun) {
                    newAnnouncements.push(item);
                }
            }
        }

        if (newAnnouncements.length === 0) return;

        logger.info(`📺 Found ${newAnnouncements.length} new Crunchyroll seasonal lineup announcement(s)`);

        // Get all guilds with Crunchyroll lineup feed enabled to extract channel IDs
        const guilds = await GuildSettings.find({
            "crunchyrollLineup.enabled": true,
            "crunchyrollLineup.channelId": { $ne: null }
        }).lean();

        if (guilds.length === 0) return;

        const targetChannelIds = guilds.map(g => g.crunchyrollLineup.channelId!);

        // Publish to RAMEN Bus for subscribers to broadcast
        ramen.publish("crunchyroll:new_lineup_announcement", {
            announcements: newAnnouncements,
            targetChannelIds
        });
    } catch (error) {
        logger.error(error as Error, "Crunchyroll lineup feed check error");
    } finally {
        lock.isChecking = false;
    }
}
