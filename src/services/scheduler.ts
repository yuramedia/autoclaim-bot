/**
 * Scheduler Service
 * Handles automated daily claims for all users, robust socket & database
 * resilience, lock auto-expiration, and periodic missed-claim recovery.
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
import { ensureDatabaseConnected, isDatabaseConnected } from "../database/connection";

/** Batch processing configuration */
const BATCH_SIZE = 5; // Process 5 users concurrently
const DELAY_BETWEEN_BATCHES = 2000; // 2 seconds between batches

/** Per-user claim safety timeout (45 seconds) */
export const USER_CLAIM_TIMEOUT_MS = 45_000;

/** Maximum lock duration before forced auto-release (15 minutes) */
export const MAX_LOCK_DURATION_MS = 15 * 60 * 1000;

/** Interval for periodic missed claim watchdog (30 minutes) */
export const WATCHDOG_INTERVAL_MS = 30 * 60 * 1000;

/** Base filter: users with at least one active credential */
const USERS_WITH_TOKENS_FILTER: Record<string, unknown> = {
    $or: [{ "hoyolab.token": { $exists: true, $ne: "" } }, { "endfield.accountToken": { $exists: true, $ne: "" } }]
};

/** Projection — only fields read during claim processing (keeps cursor light) */
const CLAIM_PROJECTION = {
    discordId: 1,
    "settings.notifyOnClaim": 1,
    "hoyolab.token": 1,
    "hoyolab.games": 1,
    "endfield.accountToken": 1
};

/** Token-error substrings used to force-notify users regardless of preferences */
const TOKEN_ERROR_PATTERNS = [
    "expired",
    "invalid token",
    "ACCOUNT_TOKEN",
    "cookie_token",
    "Please log in",
    "decryption failed",
    "not in encrypted format",
    "encryption key"
] as const;

/** Formatter reused for Singapore-time calculations with explicit 24-hour cycle. */
const SG_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
});

/** Timestamp when current claim execution started, or null if idle */
let schedulerStartedAt: number | null = null;

/** Handle for the periodic watchdog interval (tracked for shutdown/tests) */
let watchdogTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Checks whether the daily claims execution lock is currently held.
 * Automatically breaks deadlocks if a run exceeds MAX_LOCK_DURATION_MS.
 */
export function isSchedulerRunning(): boolean {
    if (schedulerStartedAt === null) return false;

    if (Date.now() - schedulerStartedAt >= MAX_LOCK_DURATION_MS) {
        logger.warn("⚠️ Daily claims execution exceeded lock duration (15m). Auto-releasing lock.");
        schedulerStartedAt = null;
        return false;
    }

    return true;
}

/**
 * Force reset scheduler lock (used primarily in test suites).
 */
export function resetSchedulerLockForTest(): void {
    schedulerStartedAt = null;
}

/**
 * Stops the periodic missed-claims watchdog timer if active.
 */
export function stopSchedulerWatchdog(): void {
    if (watchdogTimer) {
        clearInterval(watchdogTimer);
        watchdogTimer = null;
    }
}

/**
 * Start the daily claim scheduler and periodic recovery watchdog.
 * @param client - Discord client instance
 */
export function startScheduler(client: Client): void {
    const { hour, minute } = config.scheduler;
    const cronExpression = `${minute} ${hour} * * *`;

    logger.info(
        `📅 Scheduler set for ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} every day (UTC+8)`
    );

    // Primary daily cron trigger
    cron.schedule(
        cronExpression,
        async () => {
            try {
                // Only run on Shard 0 to prevent duplicate claims
                if (client.shard && !client.shard.ids.includes(0)) {
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

    // Periodic Watchdog: Checks every 30 minutes for any missed claims
    // Recovers claims if bot was offline, network dropped, or database reconnected during scheduled time
    stopSchedulerWatchdog();
    watchdogTimer = setInterval(async () => {
        try {
            if (client.shard && !client.shard.ids.includes(0)) {
                return;
            }
            await checkMissedClaims(client);
        } catch (error) {
            logger.error(error, "[Scheduler] Error in missed claims watchdog:");
        }
    }, WATCHDOG_INTERVAL_MS);

    // Unref timer if available so it won't hold open process on shutdown
    if (typeof watchdogTimer.unref === "function") {
        watchdogTimer.unref();
    }
}

/**
 * Run daily claims for all users (or a filtered subset).
 * Reads users with active tokens and processes them in batches.
 * Only runs on Shard 0 in a sharded deployment to prevent duplicate claims.
 * @param client - Discord client instance for shard guard check.
 * @param userFilter - Optional Mongo filter restricting which users to process
 *   (used by missed-claim recovery to re-run only affected users).
 * @returns A promise that resolves when all daily claims are processed.
 */
export async function runDailyClaims(client: Client, userFilter?: Record<string, unknown>): Promise<void> {
    // Prevent overlapping runs (cron + missedClaims recovery) with lock auto-expiration
    if (isSchedulerRunning()) {
        logger.info("⏳ Skipping daily claims — previous run still in progress");
        return;
    }

    // Only run on Shard 0 to prevent duplicate claims across shards
    if (client.shard && !client.shard.ids.includes(0)) {
        return;
    }

    // Verify MongoDB connection readiness before starting cursor operations
    const dbConnected = await ensureDatabaseConnected(5000);
    if (!dbConnected) {
        logger.warn("⚠️ MongoDB not connected. Skipping daily claims run — watchdog will retry upon reconnection.");
        return;
    }

    schedulerStartedAt = Date.now();
    try {
        // Use cursor + projection for memory efficiency
        const cursor = User.find(userFilter ?? USERS_WITH_TOKENS_FILTER)
            .select(CLAIM_PROJECTION)
            .cursor();

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
        logger.error(error, "[Scheduler] Error during daily claims run:");
    } finally {
        schedulerStartedAt = null;
    }
}

/** Returns midnight today in UTC+8 (Asia/Singapore timezone). */
export function getTodayMidnightUtc8(): Date {
    const sg = getSingaporeTime();
    return new Date(
        `${sg.year}-${String(sg.month).padStart(2, "0")}-${String(sg.day).padStart(2, "0")}T00:00:00+08:00`
    );
}

/**
 * Process claims for a single user with safety timeout
 * @param user - User document from database
 * @returns A promise that resolves when processing is complete
 */
async function processUserClaim(user: IUser): Promise<void> {
    const timeoutPromise = new Promise<void>((_, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`Claim processing timed out after ${USER_CLAIM_TIMEOUT_MS / 1000}s`));
        }, USER_CLAIM_TIMEOUT_MS);
        if (typeof timer.unref === "function") timer.unref();
    });

    try {
        await Promise.race([executeUserClaims(user), timeoutPromise]);
    } catch (err) {
        logger.error(err, `[Scheduler] Error processing claim for user ${user.discordId}:`);
    }
}

/**
 * Execute actual claims and database updates for a single user
 * @param user - User document
 */
async function executeUserClaims(user: IUser): Promise<void> {
    const results: string[] = [];
    let hasTokenExpired = false; // Track structured token expiry from Endfield
    const claimPromises: Promise<void>[] = [];
    const todayMidnight = getTodayMidnightUtc8();

    // Claim Hoyolab (skip if already claimed today)
    const hoyolabAlreadyClaimed = Boolean(user.hoyolab?.lastClaim && user.hoyolab.lastClaim >= todayMidnight);
    if (user.hoyolab?.token && !hoyolabAlreadyClaimed) {
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

    // Claim Endfield (skip if already claimed today)
    const endfieldAlreadyClaimed = Boolean(user.endfield?.lastClaim && user.endfield.lastClaim >= todayMidnight);
    if (user.endfield?.accountToken && !endfieldAlreadyClaimed) {
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

    // Detect token errors — notify regardless of notifyOnClaim preference.
    const hasTokenError =
        hasTokenExpired || results.some(r => TOKEN_ERROR_PATTERNS.some(p => r.toLowerCase().includes(p.toLowerCase())));

    // Publish to RAMEN
    if (results.length > 0 && (user.settings?.notifyOnClaim || hasTokenError)) {
        ramen.publish("account:claim_result", {
            discordId: user.discordId,
            results,
            isTokenError: hasTokenError
        });
    }
}

/**
 * Get the current date/time components in Asia/Singapore timezone
 * @returns Object with year, month, day, hour, minute in SG timezone
 */
export function getSingaporeTime(): { year: number; month: number; day: number; hour: number; minute: number } {
    const now = new Date();
    const parts = SG_TIME_FORMATTER.formatToParts(now);

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
 * Check for missed claims and run them if needed.
 * Compares current time in Asia/Singapore timezone against the scheduled
 * claim time. If we've passed today's claim time and any user hasn't
 * been claimed yet today, triggers runDailyClaims().
 * @param client - Discord client instance
 */
export async function checkMissedClaims(client: Client): Promise<void> {
    // Only run on Shard 0 to prevent duplicate claims across shards
    if (client.shard && !client.shard.ids.includes(0)) {
        logger.debug("⏰ Skipping missed claims check — not on Shard 0");
        return;
    }

    // Verify MongoDB connection readiness
    if (!isDatabaseConnected()) {
        logger.debug("⏰ Skipping missed claims check — MongoDB not currently connected");
        return;
    }

    try {
        const { hour, minute } = config.scheduler;
        const sg = getSingaporeTime();

        const currentMinutes = sg.hour * 60 + sg.minute;
        const scheduledMinutes = hour * 60 + minute;

        // If we haven't passed today's claim time yet, nothing to recover
        if (currentMinutes < scheduledMinutes) {
            logger.debug("⏰ Scheduled claim time hasn't passed yet today. No recovery needed.");
            return;
        }

        // Calculate midnight of today in Asia/Singapore as a UTC Date
        const todayMidnightSG = getTodayMidnightUtc8();

        // Find users who have tokens but haven't claimed today
        const missedFilter = {
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
        };

        const missedCount = await User.countDocuments(missedFilter);

        if (missedCount > 0) {
            logger.info(`⚠️ Found ${missedCount} user(s) with missed claims. Running recovery...`);
            // Recovery re-processes ONLY the missed users, not the whole population
            await runDailyClaims(client, missedFilter);
        } else {
            logger.debug("✅ No missed claims detected. All users are up to date.");
        }
    } catch (error) {
        logger.error(error, "[Scheduler] Error checking missed claims:");
    }
}
