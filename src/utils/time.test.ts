/**
 * Unit tests for time.ts
 *
 * Covers: formatDuration, formatUptimeSeconds, formatUptime,
 * discordTimestamp, formatUtc8DateTime.
 *
 * getTimeUntilNextRun depends on wall-clock time and is omitted —
 * the helper functions it delegates to are tested here instead.
 */

import { describe, test, expect } from "bun:test";
import { formatDuration, formatUptime, formatUptimeSeconds, discordTimestamp, formatUtc8DateTime } from "./time";

// ── formatDuration ────────────────────────────────────────────────────────────

describe("formatDuration", () => {
    test("returns N/A for 0", () => {
        expect(formatDuration(0)).toBe("N/A");
    });

    test("returns N/A for negative values", () => {
        expect(formatDuration(-1)).toBe("N/A");
        expect(formatDuration(-60_000)).toBe("N/A");
    });

    test("formats whole seconds", () => {
        expect(formatDuration(1_000)).toBe("1s");
        expect(formatDuration(30_000)).toBe("30s");
        expect(formatDuration(59_000)).toBe("59s");
    });

    test("formats minutes with no leftover seconds", () => {
        expect(formatDuration(60_000)).toBe("1m");
        expect(formatDuration(120_000)).toBe("2m");
    });

    test("formats minutes and seconds", () => {
        expect(formatDuration(90_000)).toBe("1m 30s");
        expect(formatDuration(75_000)).toBe("1m 15s");
    });

    test("formats whole hours with no leftover minutes", () => {
        expect(formatDuration(3_600_000)).toBe("1h");
        expect(formatDuration(7_200_000)).toBe("2h");
    });

    test("formats hours and minutes (seconds are dropped)", () => {
        expect(formatDuration(3_660_000)).toBe("1h 1m");
        expect(formatDuration(5_400_000)).toBe("1h 30m");
        // 1h 1m 1s → only h and m are shown
        expect(formatDuration(3_661_000)).toBe("1h 1m");
    });
});

// ── formatUptimeSeconds ───────────────────────────────────────────────────────

describe("formatUptimeSeconds", () => {
    test("returns '0s' for zero", () => {
        expect(formatUptimeSeconds(0)).toBe("0s");
    });

    test("formats seconds only", () => {
        expect(formatUptimeSeconds(45)).toBe("45s");
        expect(formatUptimeSeconds(1)).toBe("1s");
    });

    test("formats minutes only", () => {
        expect(formatUptimeSeconds(60)).toBe("1m");
        expect(formatUptimeSeconds(120)).toBe("2m");
    });

    test("formats minutes and seconds", () => {
        expect(formatUptimeSeconds(90)).toBe("1m 30s");
        expect(formatUptimeSeconds(61)).toBe("1m 1s");
    });

    test("formats hours only", () => {
        expect(formatUptimeSeconds(3_600)).toBe("1h");
        expect(formatUptimeSeconds(7_200)).toBe("2h");
    });

    test("formats hours, minutes, and seconds", () => {
        expect(formatUptimeSeconds(3_661)).toBe("1h 1m 1s");
        expect(formatUptimeSeconds(3_600 + 120 + 5)).toBe("1h 2m 5s");
    });

    test("formats days only", () => {
        expect(formatUptimeSeconds(86_400)).toBe("1d");
        expect(formatUptimeSeconds(86_400 * 2)).toBe("2d");
    });

    test("formats days, hours, minutes, seconds", () => {
        // 1d 1h 1m 1s = 86400 + 3600 + 60 + 1 = 90061
        expect(formatUptimeSeconds(90_061)).toBe("1d 1h 1m 1s");
    });

    test("omits zero-value segments (except when all zero)", () => {
        // 1d and 1s → "1d 1s" (no hours or minutes)
        expect(formatUptimeSeconds(86_401)).toBe("1d 1s");
        // 1h and 1s → "1h 1s" (no minutes)
        expect(formatUptimeSeconds(3_601)).toBe("1h 1s");
    });
});

// ── formatUptime ──────────────────────────────────────────────────────────────

describe("formatUptime", () => {
    test("converts milliseconds to the same string as formatUptimeSeconds", () => {
        expect(formatUptime(90_061_000)).toBe("1d 1h 1m 1s");
        expect(formatUptime(0)).toBe("0s");
        expect(formatUptime(60_000)).toBe("1m");
    });
});

// ── discordTimestamp ──────────────────────────────────────────────────────────

describe("discordTimestamp", () => {
    const date = new Date("2024-06-01T12:00:00.000Z");
    const unix = Math.floor(date.getTime() / 1000);

    test("defaults to relative style (R)", () => {
        expect(discordTimestamp(date)).toBe(`<t:${unix}:R>`);
    });

    test("formats with explicit style F (full date-time)", () => {
        expect(discordTimestamp(date, "F")).toBe(`<t:${unix}:F>`);
    });

    test("formats with style D (date only)", () => {
        expect(discordTimestamp(date, "D")).toBe(`<t:${unix}:D>`);
    });

    test("formats with style t (short time)", () => {
        expect(discordTimestamp(date, "t")).toBe(`<t:${unix}:t>`);
    });

    test("formats with style T (long time)", () => {
        expect(discordTimestamp(date, "T")).toBe(`<t:${unix}:T>`);
    });

    test("unix timestamp is floored (no milliseconds)", () => {
        const d = new Date(1_717_243_999_999); // .999 ms
        const result = discordTimestamp(d);
        // Must not contain a decimal point
        expect(result).not.toContain(".");
        expect(result).toMatch(/^<t:\d+:R>$/);
    });
});

// ── formatUtc8DateTime ────────────────────────────────────────────────────────

describe("formatUtc8DateTime", () => {
    test("converts a UTC date to YYYY-MM-DD HH:MM:SS in UTC+8", () => {
        // 2024-01-15 00:00:00 UTC = 2024-01-15 08:00:00 UTC+8
        const result = formatUtc8DateTime(new Date("2024-01-15T00:00:00.000Z"));
        expect(result).toBe("2024-01-15 08:00:00");
    });

    test("handles UTC midnight crossing into the next day", () => {
        // 2024-01-14 17:00:00 UTC = 2024-01-15 01:00:00 UTC+8
        const result = formatUtc8DateTime(new Date("2024-01-14T17:00:00.000Z"));
        expect(result).toBe("2024-01-15 01:00:00");
    });

    test("returns a string matching YYYY-MM-DD HH:MM:SS when called without arguments", () => {
        const result = formatUtc8DateTime();
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test("output is exactly 19 characters long", () => {
        const result = formatUtc8DateTime(new Date());
        expect(result.length).toBe(19);
    });
});
