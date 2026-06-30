/**
 * Unit tests for constants/hoyolab.ts
 *
 * These tests guard against accidental breakage of the API configuration:
 * missing game keys, malformed URLs, missing required headers, or a wiped
 * DS salt — all of which would silently break daily claims for every user.
 */

import { describe, test, expect } from "bun:test";
import {
    HOYOLAB_GAMES,
    HOYOLAB_HEADERS,
    HOYOLAB_REDEEM_URLS,
    HOYOLAB_DS_SALT
} from "./hoyolab";

const SUPPORTED_GAME_KEYS = [
    "genshin",
    "starRail",
    "honkai3",
    "tearsOfThemis",
    "zenlessZoneZero"
] as const;

// ── HOYOLAB_GAMES ─────────────────────────────────────────────────────────────

describe("HOYOLAB_GAMES", () => {
    test("contains an entry for each supported game", () => {
        for (const key of SUPPORTED_GAME_KEYS) {
            expect(HOYOLAB_GAMES[key], `Missing config for "${key}"`).toBeDefined();
        }
    });

    test("covers exactly the five supported games (no extra or missing keys)", () => {
        expect(Object.keys(HOYOLAB_GAMES)).toHaveLength(5);
    });

    test("every game has a non-empty display name", () => {
        for (const [key, cfg] of Object.entries(HOYOLAB_GAMES)) {
            expect(cfg.name, `${key}.name`).toBeTruthy();
            expect(typeof cfg.name, `${key}.name type`).toBe("string");
        }
    });

    test("every game has a valid HTTPS sign-in URL", () => {
        for (const [key, cfg] of Object.entries(HOYOLAB_GAMES)) {
            expect(cfg.url, `${key}.url`).toMatch(/^https:\/\//);
            expect(cfg.url, `${key}.url must point to hoyolab.com`).toContain("hoyolab.com");
        }
    });

    test("every game has a non-empty actId", () => {
        for (const [key, cfg] of Object.entries(HOYOLAB_GAMES)) {
            expect(cfg.actId, `${key}.actId`).toBeTruthy();
            expect(typeof cfg.actId, `${key}.actId type`).toBe("string");
        }
    });

    test("every game has a non-empty bizName", () => {
        for (const [key, cfg] of Object.entries(HOYOLAB_GAMES)) {
            expect(cfg.bizName, `${key}.bizName`).toBeTruthy();
            expect(typeof cfg.bizName, `${key}.bizName type`).toBe("string");
        }
    });

    test("all actIds are unique (no copy-paste duplicates)", () => {
        const actIds = Object.values(HOYOLAB_GAMES).map(c => c.actId);
        const unique = new Set(actIds);
        expect(unique.size).toBe(actIds.length);
    });

    test("all bizNames are unique", () => {
        const bizNames = Object.values(HOYOLAB_GAMES).map(c => c.bizName);
        const unique = new Set(bizNames);
        expect(unique.size).toBe(bizNames.length);
    });

    test("ZZZ config has the required x-rpc-signgame extra header", () => {
        const zzz = HOYOLAB_GAMES["zenlessZoneZero"];
        expect(zzz?.extraHeaders?.["x-rpc-signgame"]).toBe("zzz");
    });

    test("games other than ZZZ do not have extraHeaders (or they are empty)", () => {
        const keysWithout = ["genshin", "starRail", "honkai3", "tearsOfThemis"] as const;
        for (const key of keysWithout) {
            const cfg = HOYOLAB_GAMES[key];
            const hasExtra =
                cfg?.extraHeaders !== undefined &&
                Object.keys(cfg.extraHeaders).length > 0;
            expect(hasExtra, `${key} should not have extra headers`).toBe(false);
        }
    });
});

// ── HOYOLAB_HEADERS ───────────────────────────────────────────────────────────

describe("HOYOLAB_HEADERS", () => {
    test("includes an Accept header", () => {
        expect(HOYOLAB_HEADERS["Accept"]).toBeDefined();
    });

    test("includes a User-Agent header", () => {
        expect(HOYOLAB_HEADERS["User-Agent"]).toBeDefined();
        expect(HOYOLAB_HEADERS["User-Agent"].length).toBeGreaterThan(0);
    });

    test("includes x-rpc-app_version", () => {
        expect(HOYOLAB_HEADERS["x-rpc-app_version"]).toBeDefined();
    });

    test("includes x-rpc-client_type", () => {
        expect(HOYOLAB_HEADERS["x-rpc-client_type"]).toBeDefined();
    });

    test("includes a Referer pointing to hoyolab.com", () => {
        expect(HOYOLAB_HEADERS["Referer"]).toContain("hoyolab.com");
    });

    test("includes an Origin pointing to hoyolab.com", () => {
        expect(HOYOLAB_HEADERS["Origin"]).toContain("hoyolab.com");
    });
});

// ── HOYOLAB_REDEEM_URLS ───────────────────────────────────────────────────────

describe("HOYOLAB_REDEEM_URLS", () => {
    test("has a base URL for Genshin Impact", () => {
        expect(HOYOLAB_REDEEM_URLS["genshin"]).toBeDefined();
    });

    test("has a base URL for Honkai: Star Rail", () => {
        expect(HOYOLAB_REDEEM_URLS["starRail"]).toBeDefined();
    });

    test("has a base URL for Zenless Zone Zero", () => {
        expect(HOYOLAB_REDEEM_URLS["zenlessZoneZero"]).toBeDefined();
    });

    test("all URLs use HTTPS", () => {
        for (const [key, url] of Object.entries(HOYOLAB_REDEEM_URLS)) {
            expect(url, `${key} must use HTTPS`).toMatch(/^https:\/\//);
        }
    });

    test("URLs do not have a trailing slash", () => {
        for (const [key, url] of Object.entries(HOYOLAB_REDEEM_URLS)) {
            expect(url.endsWith("/"), `${key} must not end with a slash`).toBe(false);
        }
    });
});

// ── HOYOLAB_DS_SALT ───────────────────────────────────────────────────────────

describe("HOYOLAB_DS_SALT", () => {
    test("is a non-empty string", () => {
        expect(typeof HOYOLAB_DS_SALT).toBe("string");
        expect(HOYOLAB_DS_SALT.length).toBeGreaterThan(0);
    });

    test("contains only lowercase alphanumeric characters (expected format)", () => {
        expect(HOYOLAB_DS_SALT).toMatch(/^[a-z0-9]+$/);
    });

    test("is at least 16 characters long", () => {
        // The current salt is 32 chars; guard against accidental truncation.
        expect(HOYOLAB_DS_SALT.length).toBeGreaterThanOrEqual(16);
    });
});
