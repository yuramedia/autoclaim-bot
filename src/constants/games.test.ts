/**
 * Unit tests for constants/games.ts
 *
 * Covers: getGameDisplayName, getGameIcon (runtime helpers) and the
 * shape/completeness of every exported constant object.
 */

import { describe, test, expect } from "bun:test";
import {
    getGameDisplayName,
    getGameIcon,
    GAME_DISPLAY_NAMES,
    GAME_SHORT_NAMES,
    GAME_ICONS,
    GAME_COLORS,
    ENDFIELD,
    type HoyolabGameKey
} from "./games";

const ALL_GAME_KEYS: HoyolabGameKey[] = [
    "genshin",
    "starRail",
    "honkai3",
    "tearsOfThemis",
    "zenlessZoneZero"
];

// ── getGameDisplayName ────────────────────────────────────────────────────────

describe("getGameDisplayName", () => {
    test("returns the correct display name for each known key", () => {
        expect(getGameDisplayName("genshin")).toBe("Genshin Impact");
        expect(getGameDisplayName("starRail")).toBe("Honkai: Star Rail");
        expect(getGameDisplayName("honkai3")).toBe("Honkai Impact 3rd");
        expect(getGameDisplayName("tearsOfThemis")).toBe("Tears of Themis");
        expect(getGameDisplayName("zenlessZoneZero")).toBe("Zenless Zone Zero");
    });

    test("falls back to the key itself for an unrecognised game", () => {
        expect(getGameDisplayName("unknownGame")).toBe("unknownGame");
        expect(getGameDisplayName("myCustomGame")).toBe("myCustomGame");
    });

    test("falls back to an empty string when given an empty string", () => {
        // GAME_DISPLAY_NAMES[""] is undefined → undefined || "" → ""
        expect(getGameDisplayName("")).toBe("");
    });
});

// ── getGameIcon ───────────────────────────────────────────────────────────────

describe("getGameIcon", () => {
    test("returns the expected emoji for each known key", () => {
        expect(getGameIcon("genshin")).toBe("🌍");
        expect(getGameIcon("starRail")).toBe("🚂");
        expect(getGameIcon("honkai3")).toBe("⚡");
        expect(getGameIcon("tearsOfThemis")).toBe("⚖️");
        expect(getGameIcon("zenlessZoneZero")).toBe("📺");
    });

    test("returns the default 🎮 for an unrecognised game", () => {
        expect(getGameIcon("unknownGame")).toBe("🎮");
        expect(getGameIcon("")).toBe("🎮");
    });
});

// ── GAME_DISPLAY_NAMES ────────────────────────────────────────────────────────

describe("GAME_DISPLAY_NAMES", () => {
    test("has an entry for every supported game key", () => {
        for (const key of ALL_GAME_KEYS) {
            expect(GAME_DISPLAY_NAMES[key], `Missing display name for "${key}"`).toBeDefined();
        }
    });

    test("all display names are non-empty strings", () => {
        for (const [key, name] of Object.entries(GAME_DISPLAY_NAMES)) {
            expect(typeof name, key).toBe("string");
            expect(name.length, key).toBeGreaterThan(0);
        }
    });

    test("covers exactly the five expected games (no extra keys)", () => {
        expect(Object.keys(GAME_DISPLAY_NAMES)).toHaveLength(5);
    });
});

// ── GAME_SHORT_NAMES ──────────────────────────────────────────────────────────

describe("GAME_SHORT_NAMES", () => {
    test("has an abbreviation for every supported game key", () => {
        for (const key of ALL_GAME_KEYS) {
            expect(GAME_SHORT_NAMES[key], `Missing short name for "${key}"`).toBeDefined();
        }
    });

    test("all abbreviations are 2–5 characters", () => {
        for (const [key, abbr] of Object.entries(GAME_SHORT_NAMES)) {
            expect(abbr.length, key).toBeGreaterThanOrEqual(2);
            expect(abbr.length, key).toBeLessThanOrEqual(5);
        }
    });

    test("spot-check known abbreviations", () => {
        expect(GAME_SHORT_NAMES.genshin).toBe("GI");
        expect(GAME_SHORT_NAMES.starRail).toBe("HSR");
        expect(GAME_SHORT_NAMES.honkai3).toBe("HI3");
        expect(GAME_SHORT_NAMES.tearsOfThemis).toBe("ToT");
        expect(GAME_SHORT_NAMES.zenlessZoneZero).toBe("ZZZ");
    });
});

// ── GAME_ICONS ────────────────────────────────────────────────────────────────

describe("GAME_ICONS", () => {
    test("has an emoji for every supported game key", () => {
        for (const key of ALL_GAME_KEYS) {
            expect(GAME_ICONS[key], `Missing icon for "${key}"`).toBeDefined();
        }
    });

    test("all values are non-empty strings", () => {
        for (const [key, icon] of Object.entries(GAME_ICONS)) {
            expect(typeof icon, key).toBe("string");
            expect(icon.length, key).toBeGreaterThan(0);
        }
    });
});

// ── GAME_COLORS ───────────────────────────────────────────────────────────────

describe("GAME_COLORS", () => {
    test("has a color for every supported game key", () => {
        for (const key of ALL_GAME_KEYS) {
            expect(GAME_COLORS[key], `Missing color for "${key}"`).toBeDefined();
        }
    });

    test("all colors are integers in the valid 24-bit hex range [0x000000, 0xFFFFFF]", () => {
        for (const [key, color] of Object.entries(GAME_COLORS)) {
            expect(Number.isInteger(color), `${key} must be an integer`).toBe(true);
            expect(color, `${key} must be >= 0`).toBeGreaterThanOrEqual(0x000000);
            expect(color, `${key} must be <= 0xFFFFFF`).toBeLessThanOrEqual(0xffffff);
        }
    });

    test("each game has a distinct color", () => {
        const values = Object.values(GAME_COLORS);
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
    });
});

// ── ENDFIELD ──────────────────────────────────────────────────────────────────

describe("ENDFIELD constant", () => {
    test("has the correct game name", () => {
        expect(ENDFIELD.name).toBe("Arknights: Endfield");
    });

    test("has a non-empty short name", () => {
        expect(typeof ENDFIELD.shortName).toBe("string");
        expect(ENDFIELD.shortName.length).toBeGreaterThan(0);
    });

    test("has an icon string", () => {
        expect(typeof ENDFIELD.icon).toBe("string");
        expect(ENDFIELD.icon.length).toBeGreaterThan(0);
    });

    test("color is in the valid 24-bit hex range", () => {
        expect(ENDFIELD.color).toBeGreaterThanOrEqual(0x000000);
        expect(ENDFIELD.color).toBeLessThanOrEqual(0xffffff);
    });

    test("servers map has at least one entry", () => {
        expect(Object.keys(ENDFIELD.servers).length).toBeGreaterThanOrEqual(1);
    });

    test("servers map values are non-empty region name strings", () => {
        for (const [id, region] of Object.entries(ENDFIELD.servers)) {
            expect(typeof region, `server ${id}`).toBe("string");
            expect(region.length, `server ${id}`).toBeGreaterThan(0);
        }
    });
});
