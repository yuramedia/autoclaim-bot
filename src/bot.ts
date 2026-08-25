import { Events } from "discord.js";
import { config } from "./config";
import { connectDatabase, disconnectDatabase } from "./database/connection";
import { startScheduler, checkMissedClaims } from "./services/scheduler";
import { startCrunchyrollFeed } from "./services/crunchyroll-scheduler";
import { startCrunchyrollLineupFeed } from "./services/crunchyroll-lineup-scheduler";
import { startU2Feed } from "./services/u2-feed-scheduler";
import { startYouTubeFeed } from "./services/youtube-feed-scheduler";
import { handleInteraction } from "./handlers/interaction";
import { handleMessage } from "./handlers/message";
import { startPresenceUpdater } from "./utils/presence";
import { client } from "./core/client";
import { logger } from "./core/logger";
import { ramen } from "./core/ramen";
import { fetchCrunchyrollLanguages } from "./constants";
import { shutdownCooldown } from "./utils/cooldown";
import { prewarmSeasonCache } from "./commands/crrelease";
import "./services/ramen/crunchyroll-subscriber";
import "./services/ramen/u2-subscriber";
import "./services/ramen/claim-subscriber";
import "./services/ramen/youtube-subscriber";

/** Interval handle for the presence updater (set on Ready). */
let presenceTimer: ReturnType<typeof startPresenceUpdater> | null = null;

/** Guards against re-entering shutdown when multiple signals arrive. */
let shuttingDown = false;

// Ready event
client.once(Events.ClientReady, readyClient => {
    logger.info(`✅ Logged in as ${readyClient.user.tag}`);
    logger.info(`📊 Serving ${readyClient.guilds.cache.size} guilds`);

    // Initialize RAMEN Event Bus
    ramen.init(client);

    // Start scheduler
    startScheduler(client);

    // Check for missed claims (recovery after downtime)
    checkMissedClaims(client);

    // Start Crunchyroll feed
    startCrunchyrollFeed(client);

    // Start Crunchyroll lineup feed
    startCrunchyrollLineupFeed(client);

    // Start U2 BDMV feed
    startU2Feed(client);

    // Start YouTube feed
    startYouTubeFeed(client);

    // Start presence updater (interval handle kept for graceful shutdown)
    presenceTimer = startPresenceUpdater(readyClient);

    // Pre-warm /crrelease season cache in the background (per-shard in-memory)
    prewarmSeasonCache();
});

// Interaction handler
client.on(Events.InteractionCreate, handleInteraction);

// Message handler for embed fix
client.on(Events.MessageCreate, handleMessage);

// Main function
async function main() {
    try {
        logger.info("🚀 Starting Auto-Claim Bot Shard...");

        // Refresh Crunchyroll languages in the background — LANG_MAP is seeded with
        // defaults, so boot must never depend on this CDN round-trip.
        void fetchCrunchyrollLanguages();

        // Connect to database
        await connectDatabase();

        // Login to Discord
        await client.login(config.discord.token);
    } catch (error) {
        logger.error(error, "Failed to start main");
        throw error;
    }
}

/**
 * Graceful shutdown: flush in-flight DB writes and Discord sockets before exit.
 * Idempotent so repeated signals cannot re-enter mid-teardown.
 * @param signal - OS signal name that triggered shutdown.
 */
async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info(`👋 Received ${signal}, shutting down gracefully...`);

    if (presenceTimer) clearInterval(presenceTimer);
    shutdownCooldown();

    try {
        await client.destroy();
    } catch (error) {
        logger.warn(error, "Error while destroying Discord client");
    }

    try {
        await disconnectDatabase();
    } catch (error) {
        logger.error(error, "Error while closing MongoDB connection");
    }

    process.exit(0);
}

// Handle errors
process.on("unhandledRejection", error => {
    logger.error(error, "Unhandled rejection");
});

process.on("uncaughtException", error => {
    logger.error(error, "Uncaught exception");
    process.exit(1);
});

// Graceful shutdown on container stop / Ctrl+C
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Start
main().catch(err => logger.error(err, "Main function rejected"));
