import mongoose from "mongoose";
import { config } from "../config";
import { logger } from "../core/logger";

/**
 * Mongoose connection options ensuring socket resilience, connection pool
 * sizing, and heartbeat monitoring for remote and local databases.
 *
 * Sized for a long-running Node.js Discord bot process (OLTP workload):
 * - maxPoolSize (50): Accommodates concurrent slash commands, message listeners,
 *   RAMEN events, and parallel user batch claim runs without queue exhaustion.
 * - minPoolSize (5): Pre-warms connections to avoid TCP/TLS handshake latency spikes on bursts.
 * - maxIdleTimeMS (5m): Prunes idle connections above minPoolSize to reduce server-side memory footprint.
 * - serverSelectionTimeoutMS (5s): Fails fast during replica set failovers or network partitions.
 * - socketTimeoutMS (45s): Prevents hanging queries while accommodating heavy batch processing.
 */
export const MONGO_OPTIONS: mongoose.ConnectOptions = {
    serverSelectionTimeoutMS: 5_000,
    socketTimeoutMS: 45_000,
    connectTimeoutMS: 10_000,
    maxPoolSize: 50,
    minPoolSize: 5,
    maxIdleTimeMS: 300_000,
    heartbeatFrequencyMS: 10_000,
    autoIndex: process.env.NODE_ENV !== "production",
    retryWrites: true
};

/**
 * Human-readable mapping of Mongoose readyState values.
 */
export const MONGO_STATE_NAMES: Record<number, string> = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting"
};

/**
 * Checks if the MongoDB connection is currently ready and connected.
 */
export function isDatabaseConnected(): boolean {
    return mongoose.connection.readyState === 1;
}

/**
 * Database health metrics and diagnostic status.
 */
export interface DatabaseHealth {
    isConnected: boolean;
    readyState: number;
    stateName: string;
    host?: string;
    port?: number;
    name?: string;
}

/**
 * Returns diagnostic health information about the current MongoDB connection.
 */
export function getDatabaseHealth(): DatabaseHealth {
    const readyState = mongoose.connection.readyState;
    return {
        isConnected: readyState === 1,
        readyState,
        stateName: MONGO_STATE_NAMES[readyState] ?? "unknown",
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        name: mongoose.connection.name
    };
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
 * Idempotent: returns immediately if already connected, or awaits readiness if connecting.
 * Exits the process if the initial connection fails.
 */
export async function connectDatabase(): Promise<void> {
    if (mongoose.connection.readyState === 1) {
        logger.debug("MongoDB is already connected");
        return;
    }

    if (mongoose.connection.readyState === 2) {
        logger.debug("MongoDB connection already in progress, awaiting readiness...");
        const connected = await ensureDatabaseConnected();
        if (connected) return;
    }

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
    if (mongoose.connection.readyState === 0) {
        logger.debug("MongoDB already disconnected");
        return;
    }

    await mongoose.disconnect();
    logger.info("👋 Disconnected from MongoDB");
}

mongoose.connection.on("connected", () => {
    logger.info("MongoDB connection established");
});

mongoose.connection.on("open", () => {
    logger.debug("MongoDB connection opened");
});

mongoose.connection.on("error", error => {
    logger.error(error, "MongoDB connection error");
});

mongoose.connection.on("disconnected", () => {
    logger.warn("MongoDB disconnected — mongoose will attempt to reconnect automatically");
});

mongoose.connection.on("reconnected", () => {
    logger.info("✅ MongoDB reconnected");
});

mongoose.connection.on("close", () => {
    logger.debug("MongoDB connection closed");
});
