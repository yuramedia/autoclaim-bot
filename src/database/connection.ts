import mongoose from "mongoose";
import { config } from "../config";

/**
 * Connects to the MongoDB database using the configured URI.
 * Exits the process if the connection fails.
 */
export async function connectDatabase(): Promise<void> {
    try {
        await mongoose.connect(config.mongodb.uri);
        console.log("✅ Connected to MongoDB");
    } catch (error) {
        console.error("❌ Failed to connect to MongoDB:", error);
        process.exit(1);
    }
}

mongoose.connection.on("error", error => {
    console.error("MongoDB connection error:", error);
});

mongoose.connection.on("disconnected", () => {
    console.warn("MongoDB disconnected");
});
