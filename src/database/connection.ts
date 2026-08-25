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

/**
 * Closes the MongoDB connection gracefully, flushing in-flight writes.
 */
export async function disconnectDatabase(): Promise<void> {
    await mongoose.disconnect();
    logger.info("👋 Disconnected from MongoDB");
}

mongoose.connection.on("error", error => {
    logger.error(error, "MongoDB connection error");
});

mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected — mongoose will attempt to reconnect automatically");
});

mongoose.connection.on("reconnected", () => {
    logger.info("✅ MongoDB reconnected");
});
