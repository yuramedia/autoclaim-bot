import mongoose from "mongoose";
import { config } from "../config";
import { logger } from "../core/logger";

/**
 * Connects to the MongoDB database using the configured URI.
 * Exits the process if the connection fails.
 */
export async function connectDatabase(): Promise<void> {
    try {
        await mongoose.connect(config.mongodb.uri);
        logger.info("✅ Connected to MongoDB");
    } catch (error) {
        logger.error(error, "❌ Failed to connect to MongoDB");
        process.exit(1);
    }
}

mongoose.connection.on("error", error => {
    logger.error(error, "MongoDB connection error");
});

mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected");
});
