/**
 * Scheduler Service
 * Handles automated daily claims for all users
 */

import cron from "node-cron";
import { Client } from "discord.js";
import { User } from "../database/models/User";
import { HoyolabService, formatHoyolabResults } from "./hoyolab";
import { EndfieldService, formatEndfieldResult } from "./endfield";
import { config } from "../config";

/** Batch processing configuration */
const BATCH_SIZE = 5; // Process 5 users concurrently
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches

/**
 * Start the daily claim scheduler
 * @param client - Discord client instance
 */
export function startScheduler(client: Client): void {
    const { hour, minute } = config.scheduler;
    const cronExpression = `${minute} ${hour} * * *`;

    console.log(
        `📅 Scheduler set for ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} every day`
    );

    cron.schedule(
        cronExpression,
        async () => {
            // Only run on Shard 0 to prevent duplicate claims
            if (client.shard && client.shard.ids[0] !== 0) {
                return;
            }

            console.log("🔄 Running scheduled daily claims (Shard 0)...");
            await runDailyClaims(client);
        },
        {
            timezone: "Asia/Singapore" // UTC+8
        }
    );
}

/**
 * Run daily claims for all users
 * @param client - Discord client instance
 */
export async function runDailyClaims(client: Client): Promise<void> {
    try {
        // Use cursor for memory efficiency
        const cursor = User.find({
            $or: [
                { "hoyolab.token": { $exists: true, $ne: "" } },
                { "endfield.accountToken": { $exists: true, $ne: "" } }
            ]
        }).cursor();

        let batch: Promise<void>[] = [];
        let count = 0;

        console.log("📊 Starting batch processing for daily claims...");

        for await (const user of cursor) {
            batch.push(processUserClaim(client, user));
            count++;

            if (batch.length >= BATCH_SIZE) {
                await Promise.all(batch);
                batch = []; // Clear batch
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
            }
        }

        // Process remaining users in the last batch
        if (batch.length > 0) {
            await Promise.all(batch);
        }

        console.log(`✅ Daily claims completed. Processed ${count} users.`);
    } catch (error) {
        console.error("[Scheduler] Error:", error);
    }
}

/**
 * Process claims for a single user
 * @param client - Discord client instance
 * @param user - User document from database
 */
async function processUserClaim(client: Client, user: any): Promise<void> {
    const results: string[] = [];

    // Claim Hoyolab
    if (user.hoyolab?.token) {
        try {
            const hoyolab = new HoyolabService(user.hoyolab.token);
            const hoyolabResults = await hoyolab.claimAll(user.hoyolab.games);
            const resultText = formatHoyolabResults(hoyolabResults);
            results.push("**Hoyolab**\n" + resultText);

            // Update last claim
            user.hoyolab.lastClaim = new Date();
            user.hoyolab.lastClaimResult = resultText;
        } catch (error: any) {
            console.error(`[Scheduler] Hoyolab claim error for ${user.discordId}:`, error.message);
            results.push("**Hoyolab**\n❌ Error: " + error.message);
        }
    }

    // Claim Endfield
    if (user.endfield?.accountToken) {
        try {
            const endfield = new EndfieldService({
                accountToken: user.endfield.accountToken
            });
            const endfieldResult = await endfield.claim();
            const resultText = formatEndfieldResult(endfieldResult);
            results.push("**SKPORT/Endfield**\n" + resultText);

            // Update last claim
            user.endfield.lastClaim = new Date();
            user.endfield.lastClaimResult = resultText;
        } catch (error: any) {
            console.error(`[Scheduler] Endfield claim error for ${user.discordId}:`, error.message);
            results.push("**SKPORT/Endfield**\n❌ Error: " + error.message);
        }
    }

    // Save updates
    try {
        await user.save();
    } catch (saveError) {
        console.error(`[Scheduler] Failed to save user ${user.discordId}:`, saveError);
    }

    // Send DM if enabled
    if (user.settings.notifyOnClaim && results.length > 0) {
        await sendClaimNotification(client, user.discordId, results);
    }
}

/**
 * Send claim notification to user via DM
 * @param client - Discord client instance
 * @param discordId - User's Discord ID
 * @param results - Array of result strings
 */
async function sendClaimNotification(client: Client, discordId: string, results: string[]): Promise<void> {
    try {
        const discordUser = await client.users.fetch(discordId);
        await discordUser.send({
            embeds: [
                {
                    title: "📋 Daily Claim Results",
                    description: results.join("\n\n"),
                    color: 0x00ff00,
                    timestamp: new Date().toISOString()
                }
            ]
        });
    } catch {
        // User might have DMs disabled or bot is blocked
        console.warn(`[Scheduler] Could not DM user ${discordId} (might have DMs off)`);
    }
}

/**
 * Get the current date/time components in Asia/Singapore timezone
 * @returns Object with year, month, day, hour, minute in SG timezone
 */
function getSingaporeTime(): { year: number; month: number; day: number; hour: number; minute: number } {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Singapore",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
    }).formatToParts(now);

    const get = (type: string): number => parseInt(parts.find(p => p.type === type)?.value || "0", 10);

    return {
        year: get("year"),
        month: get("month"),
        day: get("day"),
        hour: get("hour"),
        minute: get("minute")
    };
}

/**
 * Check for missed claims on bot startup and run them if needed.
 * Compares current time in Asia/Singapore timezone against the scheduled
 * claim time. If we've passed today's claim time and any user hasn't
 * been claimed yet today, triggers runDailyClaims().
 * @param client - Discord client instance
 */
export async function checkMissedClaims(client: Client): Promise<void> {
    try {
        const { hour, minute } = config.scheduler;
        const sg = getSingaporeTime();

        const currentMinutes = sg.hour * 60 + sg.minute;
        const scheduledMinutes = hour * 60 + minute;

        // If we haven't passed today's claim time yet, nothing to recover
        if (currentMinutes < scheduledMinutes) {
            console.log("⏰ Scheduled claim time hasn't passed yet today. No recovery needed.");
            return;
        }

        // Calculate midnight of today in Asia/Singapore as a UTC Date
        // Create a date string in SG timezone, then convert back to UTC
        const todayMidnightSG = new Date(
            `${sg.year}-${String(sg.month).padStart(2, "0")}-${String(sg.day).padStart(2, "0")}T00:00:00+08:00`
        );

        // Find users who have tokens but haven't claimed today
        const missedCount = await User.countDocuments({
            $or: [
                {
                    "hoyolab.token": { $exists: true, $ne: "" },
                    $or: [
                        { "hoyolab.lastClaim": { $lt: todayMidnightSG } },
                        { "hoyolab.lastClaim": { $exists: false } }
                    ]
                },
                {
                    "endfield.accountToken": { $exists: true, $ne: "" },
                    $or: [
                        { "endfield.lastClaim": { $lt: todayMidnightSG } },
                        { "endfield.lastClaim": { $exists: false } }
                    ]
                }
            ]
        });

        if (missedCount > 0) {
            console.log(`⚠️ Found ${missedCount} user(s) with missed claims. Running recovery...`);
            await runDailyClaims(client);
        } else {
            console.log("✅ No missed claims detected. All users are up to date.");
        }
    } catch (error) {
        console.error("[Scheduler] Error checking missed claims:", error);
    }
}
