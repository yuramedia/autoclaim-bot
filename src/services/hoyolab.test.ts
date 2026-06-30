/**
 * Unit tests for services/hoyolab.ts
 *
 * Covers: formatHoyolabResults (pure formatter), and all public methods
 * of HoyolabService (claimGame, claimAll, validateToken, redeemCode).
 *
 * HTTP calls are intercepted by mocking the 'axios' module.  A shared
 * controller object (`http`) lets individual tests configure the response
 * for each request without re-registering the mock.
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// ── HTTP mock setup ───────────────────────────────────────────────────────────
//
// We expose a mutable `http` object so each test can override the
// simulated server response before invoking the service under test.

interface FakeResponse {
    data: Record<string, unknown>;
}

const http = {
    postResponse: { data: { retcode: 0, message: "OK" } } as FakeResponse,
    getResponse: { data: { retcode: 0 } } as FakeResponse,
    // Set to a string to make the next HTTP call throw with that message.
    shouldThrow: false as boolean | string
};

// Bun hoists mock.module calls above static imports, so this mock is in
// place before hoyolab.ts resolves its axios import.
mock.module("axios", () => ({
    default: {
        create: () => ({
            post: async (_url: string, _data?: unknown, _cfg?: unknown) => {
                if (http.shouldThrow) {
                    throw new Error(
                        typeof http.shouldThrow === "string" ? http.shouldThrow : "Network error"
                    );
                }
                return http.postResponse;
            },
            get: async (_url: string, _cfg?: unknown) => {
                if (http.shouldThrow) {
                    throw new Error(
                        typeof http.shouldThrow === "string" ? http.shouldThrow : "Network error"
                    );
                }
                return http.getResponse;
            }
        })
    }
}));

import { HoyolabService, formatHoyolabResults } from "./hoyolab";

// ── formatHoyolabResults ──────────────────────────────────────────────────────

describe("formatHoyolabResults", () => {
    test("returns a placeholder message when the results array is empty", () => {
        expect(formatHoyolabResults([])).toBe("No games configured for claiming");
    });

    test("prefixes successful claims with ✅", () => {
        const output = formatHoyolabResults([
            { success: true, game: "Genshin Impact", message: "Claimed successfully!" }
        ]);
        expect(output).toContain("✅");
        expect(output).toContain("Genshin Impact");
        expect(output).toContain("Claimed successfully!");
    });

    test("prefixes already-claimed results with 🔄", () => {
        const output = formatHoyolabResults([
            {
                success: true,
                game: "Honkai: Star Rail",
                message: "Already claimed today",
                alreadyClaimed: true
            }
        ]);
        expect(output).toContain("🔄");
        expect(output).toContain("Already claimed today");
    });

    test("prefixes failed claims with ❌", () => {
        const output = formatHoyolabResults([
            { success: false, game: "Zenless Zone Zero", message: "Token expired" }
        ]);
        expect(output).toContain("❌");
        expect(output).toContain("Token expired");
    });

    test("joins multiple results with newlines", () => {
        const output = formatHoyolabResults([
            { success: true, game: "Genshin Impact", message: "Claimed!" },
            { success: false, game: "Honkai: Star Rail", message: "Error" }
        ]);
        const lines = output.split("\n");
        expect(lines).toHaveLength(2);
    });

    test("bold-wraps the game name in every line", () => {
        const output = formatHoyolabResults([
            { success: true, game: "Tears of Themis", message: "Claimed!" }
        ]);
        expect(output).toContain("**Tears of Themis**");
    });
});

// ── HoyolabService.claimGame ──────────────────────────────────────────────────

describe("HoyolabService.claimGame", () => {
    let service: HoyolabService;

    beforeEach(() => {
        http.shouldThrow = false;
        http.postResponse = { data: { retcode: 0, message: "OK" } };
        service = new HoyolabService("ltoken_v2=abc; ltuid_v2=123; cookie_token_v2=xyz;");
    });

    test("returns success when the API responds with retcode 0", async () => {
        const result = await service.claimGame("genshin");
        expect(result.success).toBe(true);
        expect(result.game).toBe("Genshin Impact");
        expect(result.message).toBe("Claimed successfully!");
        expect(result.alreadyClaimed).toBeUndefined();
    });

    test("returns already-claimed when retcode is -5003", async () => {
        http.postResponse = { data: { retcode: -5003, message: "Traveler, you've already checked in today" } };
        const result = await service.claimGame("genshin");
        expect(result.success).toBe(true);
        expect(result.alreadyClaimed).toBe(true);
        expect(result.message).toContain("Already claimed");
    });

    test("returns already-claimed when message includes the word 'already'", async () => {
        http.postResponse = { data: { retcode: -1, message: "You have already claimed today" } };
        const result = await service.claimGame("starRail");
        expect(result.success).toBe(true);
        expect(result.alreadyClaimed).toBe(true);
    });

    test("returns a CAPTCHA error when is_risk flag is set", async () => {
        http.postResponse = {
            data: { retcode: -3001, data: { gt_result: { is_risk: true } } }
        };
        const result = await service.claimGame("genshin");
        expect(result.success).toBe(false);
        expect(result.message).toContain("CAPTCHA");
    });

    test("returns the API error message for non-special non-zero retcodes", async () => {
        http.postResponse = { data: { retcode: -500, message: "Internal server error" } };
        const result = await service.claimGame("genshin");
        expect(result.success).toBe(false);
        expect(result.message).toBe("Internal server error");
    });

    test("returns error immediately for an unknown game key (no HTTP call)", async () => {
        const result = await service.claimGame("unknownGame");
        expect(result.success).toBe(false);
        expect(result.message).toBe("Unknown game");
    });

    test("returns error containing the thrown message on network failure", async () => {
        http.shouldThrow = "Connection timed out";
        const result = await service.claimGame("genshin");
        expect(result.success).toBe(false);
        expect(result.message).toBe("Connection timed out");
    });

    test("works for every supported game key", async () => {
        const keys = ["genshin", "starRail", "honkai3", "tearsOfThemis", "zenlessZoneZero"];
        for (const key of keys) {
            http.postResponse = { data: { retcode: 0, message: "OK" } };
            const result = await service.claimGame(key);
            expect(result.success, `${key} should succeed`).toBe(true);
        }
    });
});

// ── HoyolabService.claimAll ───────────────────────────────────────────────────

describe("HoyolabService.claimAll", () => {
    let service: HoyolabService;

    beforeEach(() => {
        http.shouldThrow = false;
        http.postResponse = { data: { retcode: 0, message: "OK" } };
        service = new HoyolabService("ltoken_v2=abc; ltuid_v2=123;");
    });

    test("returns an empty array when all games are disabled", async () => {
        const results = await service.claimAll({
            genshin: false,
            starRail: false,
            honkai3: false,
            tearsOfThemis: false,
            zenlessZoneZero: false
        });
        expect(results).toHaveLength(0);
    });

    test("skips disabled games and only claims enabled ones", async () => {
        const results = await service.claimAll({
            genshin: true,
            starRail: false,
            honkai3: false,
            tearsOfThemis: false,
            zenlessZoneZero: false
        });
        expect(results).toHaveLength(1);
        expect(results[0]!.game).toBe("Genshin Impact");
    });

    test("returns one result per enabled game", async () => {
        // Two enabled games → one 1 s inter-request delay, so this test
        // takes ~1 second.  That is acceptable for a correctness check.
        const results = await service.claimAll({
            genshin: true,
            starRail: true,
            honkai3: false,
            tearsOfThemis: false,
            zenlessZoneZero: false
        });
        expect(results).toHaveLength(2);
    });

    test("returns an empty array when the enabled map is empty", async () => {
        const results = await service.claimAll({});
        expect(results).toHaveLength(0);
    });
});

// ── HoyolabService.validateToken ──────────────────────────────────────────────

describe("HoyolabService.validateToken", () => {
    let service: HoyolabService;

    beforeEach(() => {
        http.shouldThrow = false;
        http.getResponse = { data: { retcode: 0 } };
        service = new HoyolabService("ltoken_v2=abc; ltuid_v2=123;");
    });

    test("returns { valid: true } when the API responds with retcode 0", async () => {
        const result = await service.validateToken();
        expect(result.valid).toBe(true);
        expect(result.message).toBe("Token valid");
    });

    test("returns { valid: false } with the API error message on non-zero retcode", async () => {
        http.getResponse = { data: { retcode: -100, message: "Cookie has expired" } };
        const result = await service.validateToken();
        expect(result.valid).toBe(false);
        expect(result.message).toBe("Cookie has expired");
    });

    test("returns { valid: false } on network failure", async () => {
        http.shouldThrow = "Request timed out";
        const result = await service.validateToken();
        expect(result.valid).toBe(false);
        expect(result.message).toBe("Request timed out");
    });
});

// ── HoyolabService.redeemCode ─────────────────────────────────────────────────

describe("HoyolabService.redeemCode", () => {
    const mockAccount = {
        game_biz: "hk4e_global",
        region: "os_asia",
        game_uid: "123456789",
        nickname: "Traveler",
        level: 60,
        region_name: "Asia",
        is_official: true
    };

    beforeEach(() => {
        http.shouldThrow = false;
        http.getResponse = { data: { retcode: 0, message: "OK" } };
    });

    test("returns an error immediately when cookie_token is absent from the token string", async () => {
        // Token without cookie_token_v2 or cookie_token
        const svc = new HoyolabService("ltoken_v2=abc; ltuid_v2=123;");
        const result = await svc.redeemCode("genshin", mockAccount, "TESTCODE123");
        expect(result.success).toBe(false);
        expect(result.message).toContain("cookie_token");
    });

    test("returns success when the API confirms redemption", async () => {
        const svc = new HoyolabService(
            "ltoken_v2=abc; ltuid_v2=123; cookie_token_v2=xyz;"
        );
        http.getResponse = { data: { retcode: 0 } };
        const result = await svc.redeemCode("genshin", mockAccount, "TESTCODE123");
        expect(result.success).toBe(true);
        expect(result.message).toBe("Redeemed successfully");
    });

    test("returns the API failure message when retcode is non-zero", async () => {
        const svc = new HoyolabService(
            "ltoken_v2=abc; ltuid_v2=123; cookie_token_v2=xyz;"
        );
        http.getResponse = { data: { retcode: -2001, message: "Redemption code has expired" } };
        const result = await svc.redeemCode("genshin", mockAccount, "EXPIREDCODE");
        expect(result.success).toBe(false);
        expect(result.message).toBe("Redemption code has expired");
    });

    test("returns error immediately for an unknown game key", async () => {
        const svc = new HoyolabService(
            "ltoken_v2=abc; ltuid_v2=123; cookie_token_v2=xyz;"
        );
        const result = await svc.redeemCode("unknownGame", mockAccount, "CODE123");
        expect(result.success).toBe(false);
        expect(result.message).toBe("Unknown game");
    });

    test("returns error on network failure", async () => {
        const svc = new HoyolabService(
            "ltoken_v2=abc; ltuid_v2=123; cookie_token_v2=xyz;"
        );
        http.shouldThrow = "Network error";
        const result = await svc.redeemCode("genshin", mockAccount, "CODE123");
        expect(result.success).toBe(false);
        expect(result.message).toBeDefined();
    });

    test("recognises cookie_token (non-v2 variant) as sufficient", async () => {
        const svc = new HoyolabService("ltoken_v2=abc; ltuid_v2=123; cookie_token=legacy;");
        http.getResponse = { data: { retcode: 0 } };
        const result = await svc.redeemCode("genshin", mockAccount, "CODE");
        expect(result.success).toBe(true);
    });
});
