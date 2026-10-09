/**
 * Crunchyroll Credentials Synchronization Service
 *
 * Periodically syncs Crunchyroll Android TV basic auth token and User-Agent
 * from the repository source of truth (updated daily by GitHub Actions),
 * provides version comparison to prevent downgrades, and enables self-healing
 * on HTTP 401/403 authorization failures.
 */

import { config } from "../config";
import { logger } from "../core/logger";
import { fetchWithTimeout } from "../utils/http";
import {
    getActiveCrunchyrollAuth,
    setActiveCrunchyrollAuth,
    type CrunchyrollCredentials
} from "../constants/crunchyroll";

/** 24-hour periodic check interval in milliseconds */
export const CREDENTIALS_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Raw GitHub URL for the repository's crunchyroll constants */
export const REMOTE_CONSTANTS_URL =
    "https://raw.githubusercontent.com/yuramedia/autoclaim-bot/main/src/constants/crunchyroll.ts";

let syncTimer: NodeJS.Timeout | null = null;

/**
 * Parses version numbers from a User-Agent or version string into a numeric tuple [major, minor, patch, build].
 * E.g., "Crunchyroll/ANDROIDTV/3.71.0_22359 (Android 12...)" -> [3, 71, 0, 22359]
 *
 * @param versionString - The User-Agent string or raw version string.
 * @returns Array of numbers representing the version tuple.
 */
export function parseVersionTuple(versionString: string): number[] {
    const match = versionString.match(/(\d+)\.(\d+)(?:\.(\d+))?(?:[_\s(]+(\d+)\)?)?/);
    if (!match) return [0, 0, 0, 0];

    const major = parseInt(match[1] ?? "0", 10) || 0;
    const minor = parseInt(match[2] ?? "0", 10) || 0;
    const patch = parseInt(match[3] ?? "0", 10) || 0;
    const build = parseInt(match[4] ?? "0", 10) || 0;

    return [major, minor, patch, build];
}

/**
 * Compares two version strings or User-Agent strings.
 * Returns positive if a > b, negative if a < b, 0 if equal.
 *
 * @param a - First version string.
 * @param b - Second version string.
 * @returns Comparison result number.
 */
export function compareVersions(a: string, b: string): number {
    const tupleA = parseVersionTuple(a);
    const tupleB = parseVersionTuple(b);

    for (let i = 0; i < 4; i++) {
        const diff = (tupleA[i] ?? 0) - (tupleB[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

/**
 * Parses CRUNCHYROLL_BASIC_AUTH and CRUNCHYROLL_USER_AGENT from raw constants file content.
 *
 * @param sourceText - Raw typescript code from constants file.
 * @returns Parsed credentials or null if not found.
 */
export function parseConstantsFromSource(sourceText: string): CrunchyrollCredentials | null {
    const basicAuthMatch = sourceText.match(/CRUNCHYROLL_BASIC_AUTH\s*=\s*"([^"]+)"/);
    const userAgentMatch = sourceText.match(/CRUNCHYROLL_USER_AGENT\s*=\s*"([^"]+)"/);

    if (basicAuthMatch?.[1] && userAgentMatch?.[1]) {
        return {
            basicAuth: basicAuthMatch[1].trim(),
            userAgent: userAgentMatch[1].trim()
        };
    }

    return null;
}

/**
 * Synchronizes active Crunchyroll credentials.
 * Checks for manual .env overrides first, then checks remote constants source.
 * Updates active in-memory credentials if newer or forced (self-healing).
 *
 * @param force - If true, ignores version check and applies valid fetched credentials immediately.
 * @returns True if active credentials were updated or already manually overridden, false otherwise.
 */
export async function syncCrunchyrollCredentials(force = false): Promise<boolean> {
    // 1. Check if auto update is disabled
    if (!config.crunchyroll.autoUpdateCredentials) {
        logger.debug("[CrunchyrollCredentials] Auto-update is disabled via config");
        return false;
    }

    // 2. Check manual environment variable override
    if (config.crunchyroll.basicAuth && config.crunchyroll.userAgent) {
        setActiveCrunchyrollAuth({
            basicAuth: config.crunchyroll.basicAuth,
            userAgent: config.crunchyroll.userAgent
        });
        logger.info("[CrunchyrollCredentials] Using manual credentials from environment variables");
        return true;
    }

    const current = getActiveCrunchyrollAuth();

    try {
        const res = await fetchWithTimeout(REMOTE_CONSTANTS_URL, { timeoutMs: 10000 });
        if (!res.ok) {
            logger.warn(`[CrunchyrollCredentials] Failed to fetch remote constants (HTTP ${res.status})`);
            return false;
        }

        const sourceText = await res.text();
        const parsed = parseConstantsFromSource(sourceText);

        if (!parsed) {
            logger.warn("[CrunchyrollCredentials] Unable to parse credentials from remote constants");
            return false;
        }

        const versionDiff = compareVersions(parsed.userAgent, current.userAgent);

        if (force || versionDiff > 0 || (versionDiff === 0 && parsed.basicAuth !== current.basicAuth)) {
            setActiveCrunchyrollAuth(parsed);
            logger.info(
                `[CrunchyrollCredentials] Successfully updated credentials (UA: ${parsed.userAgent.slice(0, 40)}..., force: ${force})`
            );
            return true;
        }

        logger.debug("[CrunchyrollCredentials] Active credentials are already up-to-date");
        return false;
    } catch (error) {
        logger.warn(error as Error, "[CrunchyrollCredentials] Error during credentials synchronization");
        return false;
    }
}

/**
 * Starts the Crunchyroll credentials background synchronization scheduler.
 * Performs an initial sync on startup, then checks once every 24 hours.
 */
export function startCrunchyrollCredentialsScheduler(): void {
    if (syncTimer) return;

    logger.info("🕒 Starting Crunchyroll Credentials daily scheduler...");
    // Initial sync in background
    void syncCrunchyrollCredentials(false);

    syncTimer = setInterval(() => {
        void syncCrunchyrollCredentials(false);
    }, CREDENTIALS_SYNC_INTERVAL_MS);

    if (syncTimer.unref) {
        syncTimer.unref();
    }
}

/**
 * Stops the Crunchyroll credentials scheduler (for graceful shutdown or tests).
 */
export function stopCrunchyrollCredentialsScheduler(): void {
    if (syncTimer) {
        clearInterval(syncTimer);
        syncTimer = null;
    }
}
