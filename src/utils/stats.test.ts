/**
 * Unit tests for stats.ts
 *
 * Covers: parseStat — the K/M/B abbreviation parser used for view counts,
 * follower numbers, and other human-readable stat strings.
 */

import { describe, test, expect } from "bun:test";
import { parseStat } from "./stats";

describe("parseStat", () => {
    // ── Falsy / empty input ───────────────────────────────────────────────────

    test("returns 0 for undefined", () => {
        expect(parseStat(undefined)).toBe(0);
    });

    test("returns 0 for empty string", () => {
        expect(parseStat("")).toBe(0);
    });

    test("returns 0 for a purely non-numeric string", () => {
        expect(parseStat("views")).toBe(0);
        expect(parseStat("—")).toBe(0);
    });

    // ── Plain integers ────────────────────────────────────────────────────────

    test("parses a plain integer string", () => {
        expect(parseStat("0")).toBe(0);
        expect(parseStat("1")).toBe(1);
        expect(parseStat("1234")).toBe(1234);
    });

    test("strips non-numeric punctuation (commas, currency signs)", () => {
        expect(parseStat("1,234")).toBe(1234);
        expect(parseStat("$500")).toBe(500);
    });

    // ── K suffix (thousands) ──────────────────────────────────────────────────

    test("parses whole-number K", () => {
        expect(parseStat("1K")).toBe(1_000);
        expect(parseStat("10K")).toBe(10_000);
    });

    test("parses decimal K", () => {
        expect(parseStat("1.5K")).toBe(1_500);
        expect(parseStat("2.5K")).toBe(2_500);
    });

    test("handles lowercase k", () => {
        expect(parseStat("3k")).toBe(3_000);
    });

    // ── M suffix (millions) ───────────────────────────────────────────────────

    test("parses whole-number M", () => {
        expect(parseStat("1M")).toBe(1_000_000);
    });

    test("parses decimal M", () => {
        expect(parseStat("2.5M")).toBe(2_500_000);
    });

    // ── B suffix (billions) ───────────────────────────────────────────────────

    test("parses whole-number B", () => {
        expect(parseStat("1B")).toBe(1_000_000_000);
    });

    test("parses decimal B", () => {
        expect(parseStat("1.2B")).toBe(1_200_000_000);
    });

    // ── Rounding ──────────────────────────────────────────────────────────────

    test("rounds to the nearest integer", () => {
        // 1.005K = 1.005 * 1000 = 1005 (exact integer, no rounding needed)
        expect(parseStat("1.005K")).toBe(1_005);
        // 1.0005M = 1.0005 * 1_000_000 = 1_000_500 (exact)
        expect(parseStat("1.0005M")).toBe(1_000_500);
        // 1.5K = 1500 (no rounding)
        expect(parseStat("1.5K")).toBe(1_500);
    });
});
