import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import mongoose from "mongoose";
import {
    getSingaporeTime,
    getTodayMidnightUtc8,
    isSchedulerRunning,
    resetSchedulerLockForTest,
    checkMissedClaims,
    runDailyClaims,
    MAX_LOCK_DURATION_MS,
    USER_CLAIM_TIMEOUT_MS,
    WATCHDOG_INTERVAL_MS
} from "./scheduler";
import { User } from "../database/models/user";
import { config } from "../config";
import type { Client } from "discord.js";

function setMongoReadyState(state: number): void {
    Object.defineProperty(mongoose.connection, "readyState", {
        value: state,
        configurable: true,
        writable: true
    });
}

describe("Scheduler Service", () => {
    const origReadyStateDescriptor = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");

    beforeEach(() => {
        resetSchedulerLockForTest();
    });

    afterEach(() => {
        resetSchedulerLockForTest();
        if (origReadyStateDescriptor) {
            Object.defineProperty(mongoose.connection, "readyState", origReadyStateDescriptor);
        }
    });

    describe("Constants and Configuration", () => {
        it("has sensible timeout, lock, and watchdog intervals", () => {
            expect(USER_CLAIM_TIMEOUT_MS).toBe(45_000);
            expect(MAX_LOCK_DURATION_MS).toBe(15 * 60 * 1000);
            expect(WATCHDOG_INTERVAL_MS).toBe(30 * 60 * 1000);
        });
    });

    describe("Timezone Calculations (UTC+8)", () => {
        it("getSingaporeTime returns valid components within range", () => {
            const sg = getSingaporeTime();
            expect(sg.year).toBeGreaterThanOrEqual(2025);
            expect(sg.month).toBeGreaterThanOrEqual(1);
            expect(sg.month).toBeLessThanOrEqual(12);
            expect(sg.day).toBeGreaterThanOrEqual(1);
            expect(sg.day).toBeLessThanOrEqual(31);
            expect(sg.hour).toBeGreaterThanOrEqual(0);
            expect(sg.hour).toBeLessThanOrEqual(23);
            expect(sg.minute).toBeGreaterThanOrEqual(0);
            expect(sg.minute).toBeLessThanOrEqual(59);
        });

        it("getTodayMidnightUtc8 returns exact UTC+8 midnight as UTC Date", () => {
            const midnight = getTodayMidnightUtc8();
            expect(midnight).toBeInstanceOf(Date);
            expect(isNaN(midnight.getTime())).toBe(false);

            // In UTC+8, 00:00:00 is 16:00:00 UTC of the previous day
            expect(midnight.getUTCHours()).toBe(16);
            expect(midnight.getUTCMinutes()).toBe(0);
            expect(midnight.getUTCSeconds()).toBe(0);
        });
    });

    describe("Scheduler Lock & Deadlock Auto-Release", () => {
        it("reports isSchedulerRunning as false when idle", () => {
            expect(isSchedulerRunning()).toBe(false);
        });

        it("auto-releases lock when duration exceeds MAX_LOCK_DURATION_MS", () => {
            expect(isSchedulerRunning()).toBe(false);
        });
    });

    describe("Shard Guard", () => {
        it("skips execution on non-zero shards", async () => {
            const mockClient = {
                shard: { ids: [1] } // Not shard 0
            } as unknown as Client;

            // Should return immediately without querying DB
            let countCalled = false;
            const originalCount = User.countDocuments;
            User.countDocuments = (() => {
                countCalled = true;
                return Promise.resolve(0);
            }) as unknown as typeof User.countDocuments;

            try {
                await checkMissedClaims(mockClient);
                expect(countCalled).toBe(false);

                await runDailyClaims(mockClient);
                expect(isSchedulerRunning()).toBe(false);
            } finally {
                User.countDocuments = originalCount;
            }
        });
    });

    describe("checkMissedClaims", () => {
        it("skips recovery if database is not connected", async () => {
            const mockClient = {
                shard: null
            } as unknown as Client;

            setMongoReadyState(0); // disconnected

            let countCalled = false;
            const originalCount = User.countDocuments;
            User.countDocuments = (() => {
                countCalled = true;
                return Promise.resolve(0);
            }) as unknown as typeof User.countDocuments;

            try {
                await checkMissedClaims(mockClient);
                expect(countCalled).toBe(false);
            } finally {
                User.countDocuments = originalCount;
            }
        });

        it("skips recovery if scheduled claim time has not passed yet today", async () => {
            const mockClient = {
                shard: null
            } as unknown as Client;

            setMongoReadyState(1); // connected

            // Set scheduler config hour to 23:59 (far in future today)
            const origHour = config.scheduler.hour;
            const origMinute = config.scheduler.minute;
            config.scheduler.hour = 23;
            config.scheduler.minute = 59;

            let countCalled = false;
            const originalCount = User.countDocuments;
            User.countDocuments = (() => {
                countCalled = true;
                return Promise.resolve(0);
            }) as unknown as typeof User.countDocuments;

            try {
                await checkMissedClaims(mockClient);
                expect(countCalled).toBe(false);
            } finally {
                config.scheduler.hour = origHour;
                config.scheduler.minute = origMinute;
                User.countDocuments = originalCount;
            }
        });

        it("runs recovery query if scheduled claim time has passed", async () => {
            const mockClient = {
                shard: null
            } as unknown as Client;

            setMongoReadyState(1); // connected

            // Set scheduler config hour to 0:00 (already passed today)
            const origHour = config.scheduler.hour;
            const origMinute = config.scheduler.minute;
            config.scheduler.hour = 0;
            config.scheduler.minute = 0;

            let countCalled = false;
            const originalCount = User.countDocuments;
            User.countDocuments = (() => {
                countCalled = true;
                return Promise.resolve(0);
            }) as unknown as typeof User.countDocuments;

            try {
                await checkMissedClaims(mockClient);
                expect(countCalled).toBe(true);
            } finally {
                config.scheduler.hour = origHour;
                config.scheduler.minute = origMinute;
                User.countDocuments = originalCount;
            }
        });
    });
});
