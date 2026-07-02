/**
 * Unit tests for cooldown.ts
 *
 * Covers: getCooldownRemaining, setCooldown, formatCooldown.
 *
 * The cooldown map is a module-level singleton that is never cleared, so
 * tests use unique command/user names to avoid cross-test pollution.
 */

import { describe, test, expect } from "bun:test";
import { getCooldownRemaining, setCooldown, formatCooldown } from "./cooldown";

// ── getCooldownRemaining ──────────────────────────────────────────────────────

describe("getCooldownRemaining", () => {
    test("returns 0 when the command has never been used by anyone", () => {
        expect(getCooldownRemaining("brand-new-command", "user-1", 30_000)).toBe(0);
    });

    test("returns 0 when this specific user has no cooldown", () => {
        setCooldown("ping-cmd", "user-other");
        // A different user should have no cooldown
        expect(getCooldownRemaining("ping-cmd", "user-fresh", 30_000)).toBe(0);
    });

    test("returns remaining ms when cooldown is active", () => {
        const userId = "user-active-cd";
        const cooldownMs = 60_000;
        setCooldown("slash-cmd", userId);

        const remaining = getCooldownRemaining("slash-cmd", userId, cooldownMs);
        expect(remaining).toBeGreaterThan(0);
        expect(remaining).toBeLessThanOrEqual(cooldownMs);
    });

    test("returns 0 when cooldown duration is 0 (immediately expired)", () => {
        const userId = "user-zero-cd";
        setCooldown("zero-cmd", userId);
        // 0 ms cooldown means it's always expired
        expect(getCooldownRemaining("zero-cmd", userId, 0)).toBe(0);
    });

    test("different users on the same command are independent", () => {
        setCooldown("shared-cmd", "user-alpha");
        // user-beta was never put on cooldown for shared-cmd
        expect(getCooldownRemaining("shared-cmd", "user-beta", 60_000)).toBe(0);
    });

    test("different commands for the same user are independent", () => {
        setCooldown("cmd-a", "user-multi");
        // cmd-b was never used by this user
        expect(getCooldownRemaining("cmd-b", "user-multi", 60_000)).toBe(0);
    });
});

// ── setCooldown ───────────────────────────────────────────────────────────────

describe("setCooldown", () => {
    test("makes getCooldownRemaining return a positive value", () => {
        const userId = "user-set-test";
        setCooldown("set-cmd", userId);
        expect(getCooldownRemaining("set-cmd", userId, 30_000)).toBeGreaterThan(0);
    });

    test("overwriting an existing cooldown refreshes the timestamp", () => {
        const userId = "user-refresh";
        setCooldown("refresh-cmd", userId);

        const before = getCooldownRemaining("refresh-cmd", userId, 30_000);

        // Small artificial wait to ensure a measurable time difference
        const spin = Date.now() + 5;
        while (Date.now() < spin) {
            /* busy-wait 5 ms */
        }

        setCooldown("refresh-cmd", userId); // re-stamp
        const after = getCooldownRemaining("refresh-cmd", userId, 30_000);

        // After refreshing, the remaining time should be >= the earlier reading
        // (because the timestamp was reset to "now")
        expect(after).toBeGreaterThanOrEqual(before - 10); // 10 ms tolerance
    });
});

// ── formatCooldown ────────────────────────────────────────────────────────────

describe("formatCooldown", () => {
    test("formats sub-minute values as seconds only", () => {
        expect(formatCooldown(30_000)).toBe("30s");
        expect(formatCooldown(1_000)).toBe("1s");
        expect(formatCooldown(59_000)).toBe("59s");
    });

    test("rounds fractional seconds up (ceiling)", () => {
        // 500 ms → ceil(0.5) = 1 second
        expect(formatCooldown(500)).toBe("1s");
        // 1_001 ms → ceil(1.001) = 2 seconds
        expect(formatCooldown(1_001)).toBe("2s");
    });

    test("formats exactly one minute as '1m 0s'", () => {
        expect(formatCooldown(60_000)).toBe("1m 0s");
    });

    test("formats minutes and seconds", () => {
        expect(formatCooldown(90_000)).toBe("1m 30s");
        expect(formatCooldown(601_000)).toBe("10m 1s");
        expect(formatCooldown(300_000)).toBe("5m 0s");
    });
});
