/**
 * Scheduler Service
 * Handles automated daily claims for all users
 */

import cron from "node-cron";
import { Client } from "discord.js";
import { ramen } from "../core/ramen";
import { User } from "../database/models/user";
import type { IUser } from "../database/models/user";
import { HoyolabService, formatHoyolabResults } from "./hoyolab";
import { EndfieldService, formatEndfieldResult } from "./endfield";
import { config } from "../config";
import { logger } from "../core/logger";
import { decryptTokenCompat, encryptToken } from "../utils/token-crypto";

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

    logger.info(
        `📅 Scheduler set for ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} every day`
    );

    cron.schedule(
        cronExpression,
        async () => {
            try {
                // Only run on Shard 0 to prevent duplicate claims
                if (client.shard && client.shard.ids[0] !== 0) {
                    return;
                }

                logger.info("🔄 Running scheduled daily claims (Shard 0)...");
                await runDailyClaims(client);
            } catch (error) {
                logger.error(error, "[Scheduler] Error in scheduled cron job:");
            }
        },
        {
            timezone: "Asia/Singapore" // UTC+8
        }
    );
}

/**
 * Run daily claims for all users.
 * Reads users with active tokens and processes them in batches.
 * Only runs on Shard 0 in a sharded deployment to prevent duplicate claims.
 * @param client - Discord client instance for shard guard check.
 * @returns A promise that resolves when all daily claims are processed.
 */
let schedulerRunning = false;

export async function runDailyClaims(client: Client): Promise<void> {
    // Prevent overlapping runs (cron + missedClaims recovery)
    if (schedulerRunning) {
        logger.info("⏳ Skipping daily claims — previous run still in progress");
        return;
    }

    // Only run on Shard 0 to prevent duplicate claims across shards
    if (client.shard && client.shard.ids[0] !== 0) {
        return;
    }

    schedulerRunning = true;
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

        logger.info("📊 Starting batch processing for daily claims...");

        for await (const user of cursor) {
            batch.push(processUserClaim(user));
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

        logger.info(`✅ Daily claims completed. Processed ${count} users.`);
    } catch (error) {
        logger.error(error, "[Scheduler] Error:");
    } finally {
        schedulerRunning = false;
    }
}

/**
 * Process claims for a single user
 * @param user - User document from database
 * @returns A promise that resolves when processing is complete
 */
async function processUserClaim(user: IUser): Promise<void> {
    try {
        const results: string[] = [];
        let hasTokenExpired = false; // Track structured token expiry from Endfield
        const claimPromises: Promise<void>[] = [];

        // Claim Hoyolab
        if (user.hoyolab?.token) {
            claimPromises.push(
                (async () => {
                    try {
                        const hoyolabDecrypt = decryptTokenCompat(user.hoyolab!.token);
                        const hoyolab = new HoyolabService(hoyolabDecrypt.value);
                        const hoyolabResults = await hoyolab.claimAll(user.hoyolab!.games);
                        const resultText = formatHoyolabResults(hoyolabResults);
                        results.push("**Hoyolab**\n" + resultText);

                        // Update last claim (atomic) + re-encrypt if needed
                        const hoyolabUpdate: Record<string, unknown> = {
                            "hoyolab.lastClaim": new Date(),
                            "hoyolab.lastClaimResult": resultText
                        };
                        if (hoyolabDecrypt.needsReEncryption) {
                            hoyolabUpdate["hoyolab.token"] = encryptToken(hoyolabDecrypt.value);
                        }
                        await User.updateOne({ discordId: user.discordId }, { $set: hoyolabUpdate });
                    } catch (error: unknown) {
                        const err = error as { message?: string };
                        logger.error({
                            msg: `[Scheduler] Hoyolab claim error for ${user.discordId}:`,
                            detail: err.message
                        });
                        results.push("**Hoyolab**\n❌ Error: " + err.message);
                    }
                })()
            );
        }

        // Claim Endfield
        if (user.endfield?.accountToken) {
            claimPromises.push(
                (async () => {
                    try {
                        const endfieldDecrypt = decryptTokenCompat(user.endfield!.accountToken);
                        const endfield = new EndfieldService({
                            accountToken: endfieldDecrypt.value
                        });
                        const endfieldResult = await endfield.claim();
                        const resultText = formatEndfieldResult(endfieldResult);
                        results.push("**SKPORT/Endfield**\n" + resultText);

                        // Track structured token expiry flag from Endfield result
                        if (endfieldResult.tokenExpired) {
                            hasTokenExpired = true;
                        }

                        // Update last claim (atomic) + re-encrypt if needed
                        const endfieldUpdate: Record<string, unknown> = {
                            "endfield.lastClaim": new Date(),
                            "endfield.lastClaimResult": resultText
                        };
                        if (endfieldDecrypt.needsReEncryption) {
                            endfieldUpdate["endfield.accountToken"] = encryptToken(endfieldDecrypt.value);
                        }
                        await User.updateOne({ discordId: user.discordId }, { $set: endfieldUpdate });
                    } catch (error: unknown) {
                        const err = error as { message?: string };
                        logger.error({
                            msg: `[Scheduler] Endfield claim error for ${user.discordId}:`,
                            detail: err.message
                        });
                        results.push("**SKPORT/Endfield**\n❌ Error: " + err.message);
                    }
                })()
            );
        }

        // Wait for all claims to finish
        if (claimPromises.length > 0) {
            await Promise.all(claimPromises);
        }

        // Claim results are already saved atomically via User.updateOne() above.
        // No need for user.save() — this avoids the "lost update" race condition.

        // Detect token errors — notify regardless of notifyOnClaim preference.
        // Uses structured Endfield tokenExpired flag + Hoyolab string patterns.
        // Includes decrypt failure strings so users get notified even if decryptToken throws.
        const TOKEN_ERROR_PATTERNS = [
            "expired",
            "invalid token",
            "ACCOUNT_TOKEN",
            "cookie_token",
            "Please log in",
            "decryption failed",
            "not in encrypted format",
            "encryption key"
        ];
        const hasTokenError =
            hasTokenExpired ||
            results.some(r => TOKEN_ERROR_PATTERNS.some(p => r.toLowerCase().includes(p.toLowerCase())));

        // Publish to RAMEN:
        // - always if there is a token error (user must know even if notifications are off)
        // - conditionally if notifyOnClaim is enabled
        if (results.length > 0 && (user.settings.notifyOnClaim || hasTokenError)) {
            ramen.publish("account:claim_result", {
                discordId: user.discordId,
                results,
                isTokenError: hasTokenError
            });
        }
    } catch (err) {
        logger.error(err, `[Scheduler] Fatal error processing claim for user ${user.discordId}:`);
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
    // Only run on Shard 0 to prevent duplicate claims across shards
    if (client.shard && client.shard.ids[0] !== 0) {
        logger.info("⏰ Skipping missed claims check — not on Shard 0");
        return;
    }

    try {
        const { hour, minute } = config.scheduler;
        const sg = getSingaporeTime();

        const currentMinutes = sg.hour * 60 + sg.minute;
        const scheduledMinutes = hour * 60 + minute;

        // If we haven't passed today's claim time yet, nothing to recover
        if (currentMinutes < scheduledMinutes) {
            logger.info("⏰ Scheduled claim time hasn't passed yet today. No recovery needed.");
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
            logger.info(`⚠️ Found ${missedCount} user(s) with missed claims. Running recovery...`);
            await runDailyClaims(client);
        } else {
            logger.info("✅ No missed claims detected. All users are up to date.");
        }
    } catch (error) {
        logger.error(error, "[Scheduler] Error checking missed claims:");
    }
}
