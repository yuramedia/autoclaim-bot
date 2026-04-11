import { Events } from "discord.js";
import { config } from "./config";
import { connectDatabase } from "./database/connection";
import { startScheduler, checkMissedClaims } from "./services/scheduler";
import { startCrunchyrollFeed } from "./services/crunchyroll-scheduler";
import { startU2Feed } from "./services/u2-feed-scheduler";
import { handleInteraction } from "./handlers/interaction";
import { handleMessage } from "./handlers/message";
import { startPresenceUpdater } from "./utils/presence";
import { client } from "./core/client";
import { logger } from "./core/logger";
import { ramen } from "./core/ramen";
import "./services/ramen/crunchyroll.subscriber";
import "./services/ramen/u2.subscriber";
import "./services/ramen/claim.subscriber";

// Ready event
client.once(Events.ClientReady, readyClient => {
    logger.info(`✅ Logged in as ${readyClient.user.tag}`);
    logger.info(`📊 Serving ${readyClient.guilds.cache.size} guilds`);

    // Initialize RAMEN Event Bus
    ramen.init(client);

    // Start scheduler
    startScheduler(client);

    // Check for missed claims (recovery after downtime)
    checkMissedClaims();

    // Start Crunchyroll feed
    startCrunchyrollFeed(client);

    // Start U2 BDMV feed
    startU2Feed(client);

    // Start presence updater
    startPresenceUpdater(readyClient);
});

// Interaction handler
client.on(Events.InteractionCreate, handleInteraction);

// Message handler for embed fix
client.on(Events.MessageCreate, handleMessage);

// Main function
async function main() {
    logger.info("🚀 Starting Auto-Claim Bot Shard...");

    // Connect to database
    await connectDatabase();

    // Login to Discord
    await client.login(config.discord.token);
}

// Handle errors
process.on("unhandledRejection", error => {
    logger.error(error, "Unhandled rejection");
});

process.on("uncaughtException", error => {
    logger.error(error, "Uncaught exception");
    process.exit(1);
});

// Start
main().catch(err => logger.error(err, "Main function rejected"));
