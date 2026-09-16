import { describe, it, expect, afterEach } from "bun:test";
import mongoose from "mongoose";
import {
    isDatabaseConnected,
    getDatabaseHealth,
    ensureDatabaseConnected,
    MONGO_OPTIONS,
    MONGO_STATE_NAMES
} from "./connection";

function setMongoReadyState(state: number): void {
    Object.defineProperty(mongoose.connection, "readyState", {
        value: state,
        configurable: true,
        writable: true
    });
}

describe("MongoDB Connection", () => {
    const origReadyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");

    afterEach(() => {
        if (origReadyStateDescriptor) {
            Object.defineProperty(mongoose.connection, "readyState", origReadyStateDescriptor);
        }
    });

    describe("Connection Options", () => {
        it("has optimized connection pool settings for Discord bot OLTP workload", () => {
            expect(MONGO_OPTIONS.maxPoolSize).toBe(50);
            expect(MONGO_OPTIONS.minPoolSize).toBe(5);
            expect(MONGO_OPTIONS.maxIdleTimeMS).toBe(300_000);
            expect(MONGO_OPTIONS.serverSelectionTimeoutMS).toBe(5_000);
            expect(MONGO_OPTIONS.socketTimeoutMS).toBe(45_000);
            expect(MONGO_OPTIONS.connectTimeoutMS).toBe(10_000);
            expect(MONGO_OPTIONS.heartbeatFrequencyMS).toBe(10_000);
            expect(MONGO_OPTIONS.retryWrites).toBe(true);
        });
    });

    describe("isDatabaseConnected", () => {
        it("returns true when readyState is 1 (connected)", () => {
            setMongoReadyState(1);
            expect(isDatabaseConnected()).toBe(true);
        });

        it("returns false when readyState is 0 (disconnected)", () => {
            setMongoReadyState(0);
            expect(isDatabaseConnected()).toBe(false);
        });

        it("returns false when readyState is 2 (connecting)", () => {
            setMongoReadyState(2);
            expect(isDatabaseConnected()).toBe(false);
        });
    });

    describe("getDatabaseHealth", () => {
        it("returns accurate diagnostics for disconnected state", () => {
            setMongoReadyState(0);
            const health = getDatabaseHealth();
            expect(health.isConnected).toBe(false);
            expect(health.readyState).toBe(0);
            expect(health.stateName).toBe("disconnected");
        });

        it("returns accurate diagnostics for connected state", () => {
            setMongoReadyState(1);
            const health = getDatabaseHealth();
            expect(health.isConnected).toBe(true);
            expect(health.readyState).toBe(1);
            expect(health.stateName).toBe("connected");
        });

        it("handles all MONGO_STATE_NAMES states", () => {
            expect(MONGO_STATE_NAMES[0]).toBe("disconnected");
            expect(MONGO_STATE_NAMES[1]).toBe("connected");
            expect(MONGO_STATE_NAMES[2]).toBe("connecting");
            expect(MONGO_STATE_NAMES[3]).toBe("disconnecting");
        });
    });

    describe("ensureDatabaseConnected", () => {
        it("resolves immediately to true if readyState is 1", async () => {
            setMongoReadyState(1);
            const connected = await ensureDatabaseConnected(100);
            expect(connected).toBe(true);
        });

        it("resolves to false on timeout if not connected", async () => {
            setMongoReadyState(0);
            const connected = await ensureDatabaseConnected(50);
            expect(connected).toBe(false);
        });
    });
});
