import mongoose from "mongoose";
import { config } from "../config";
import { logger } from "../core/logger";

/**
 * Mongoose connection options ensuring socket resilience, connection pool
 * sizing, and heartbeat monitoring for remote and local databases.
 */
const MONGO_OPTIONS: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    connectTimeoutMS: 10_000,
    maxPoolSize: 10,
    minPoolSize: 1,
    heartbeatFrequencyMS: 10_000,
    autoIndex: process.env.NODE_ENV !== "production",
    retryWrites: true
};

/**
 * Checks if the MongoDB connection is currently ready and connected.
 */
export function isDatabaseConnected(): boolean {
    return mongoose.connection.readyState === 1;
}

/**
 * Ensures the database is connected, optionally waiting up to `timeoutMs`
 * if a reconnection is in progress.
 *
 * @param timeoutMs - Max milliseconds to wait for connection readiness (default 5000).
 * @returns True if connected, false otherwise.
 */
export async function ensureDatabaseConnected(timeoutMs = 5000): Promise<boolean> {
    if (mongoose.connection.readyState === 1) return true;

    return new Promise(resolve => {
        const timer = setTimeout(() => {
            cleanup();
            resolve(mongoose.connection.readyState === 1);
        }, timeoutMs);

        const onConnected = () => {
            cleanup();
            resolve(true);
        };

        const cleanup = () => {
            clearTimeout(timer);
            mongoose.connection.off("connected", onConnected);
            mongoose.connection.off("reconnected", onConnected);
        };

        mongoose.connection.once("connected", onConnected);
        mongoose.connection.once("reconnected", onConnected);
    });
}

/**
 * Connects to the MongoDB database using the configured URI and resilience options.
 * Exits the process if the initial connection fails.
 */
export async function connectDatabase(): Promise<void> {
    try {
        await mongoose.connect(config.mongodb.uri, MONGO_OPTIONS);
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
