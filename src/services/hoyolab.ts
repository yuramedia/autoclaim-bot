/**
 * Hoyolab Service
 * Handles daily check-in and code redemption for HoYoverse games
 */

import { createHash } from "crypto";
import axios, { type AxiosInstance } from "axios";
import type { ClaimResult, GameAccount, TokenValidation, RedeemResult } from "../types";
import { HOYOLAB_GAMES, HOYOLAB_HEADERS, HOYOLAB_REDEEM_URLS, HOYOLAB_DS_SALT } from "../constants";
import { logger } from "../core/logger";
import { withRetry } from "../utils/http";

// Re-export types for backwards compatibility
export type { ClaimResult, GameAccount };

/**
 * Service class for interacting with Hoyolab API.
 * Handles authentication, daily claims, and code redemption.
 */
export class HoyolabService {
    private client: AxiosInstance;
    private token: string;

    /**
     * Create a new HoyolabService instance
     * @param token - Hoyolab cookie string containing ltoken_v2, ltuid_v2, etc.
     */
    constructor(token: string) {
        this.token = token;
        this.client = axios.create({
            timeout: 30000,
            headers: {
                ...HOYOLAB_HEADERS,
                Cookie: token
            }
        });
    }

    /**
     * Generate Dynamic Secret (DS) for API authentication
     * @returns DS string in format "timestamp,random,hash"
     */
    private generateDS(): string {
        const t = Math.floor(Date.now() / 1000);
        const r = Math.random().toString(36).substring(2, 8);
        const h = createHash("md5").update(`salt=${HOYOLAB_DS_SALT}&t=${t}&r=${r}`).digest("hex");
        return `${t},${r},${h}`;
    }

    /**
     * Claim daily reward for a specific game
     * @param gameKey - Game identifier (genshin, starRail, etc.)
     * @returns Claim result with success status and message
     */
    async claimGame(gameKey: string): Promise<ClaimResult> {
        const game = HOYOLAB_GAMES[gameKey];
        if (!game) {
            return {
                success: false,
                game: gameKey,
                message: "Unknown game"
            };
        }

        try {
            const url = `${game.url}?lang=en-us&act_id=${game.actId}`;
            const headers: Record<string, string> = {};

            if (game.extraHeaders) {
                Object.assign(headers, game.extraHeaders);
            }

            // Retry transient network failures with exponential backoff
            const response = await withRetry(() => this.client.post(url, null, { headers }), { retries: 2 });
            const data = response.data;

            if (data.retcode === 0 || data.message === "OK") {
                return {
                    success: true,
                    game: game.name,
                    message: "Claimed successfully!"
                };
            }

            // Already claimed today
            if (data.retcode === -5003 || data.message?.includes("already")) {
                return {
                    success: true,
                    game: game.name,
                    message: "Already claimed today",
                    alreadyClaimed: true
                };
            }

            // Captcha/risk detected
            if (data.data?.gt_result?.is_risk) {
                return {
                    success: false,
                    game: game.name,
                    message: "CAPTCHA required - please claim manually"
                };
            }

            return {
                success: false,
                game: game.name,
                message: data.message || "Unknown error"
            };
        } catch (error: unknown) {
            const err = error as { message?: string };
            return {
                success: false,
                game: game.name,
                message: err.message || "Request failed"
            };
        }
    }

    /**
     * Claim daily rewards for all enabled games.
     * Per-game failures are isolated: one game erroring never discards the
     * results of games already claimed.
     *
     * @param enabledGames - Record of game keys to enabled status
     * @returns Array of claim results for each attempted game
     */
    async claimAll(enabledGames: Record<string, boolean>): Promise<ClaimResult[]> {
        const results: ClaimResult[] = [];

        for (const [gameKey, enabled] of Object.entries(enabledGames)) {
            if (!enabled) continue;

            // Add delay between requests to avoid rate limiting
            if (results.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            try {
                const result = await this.claimGame(gameKey);
                results.push(result);
            } catch (error) {
                logger.error({ msg: `Error claiming ${gameKey}`, err: error });
                results.push({
                    success: false,
                    game: HOYOLAB_GAMES[gameKey]?.name ?? gameKey,
                    message: "Request failed"
                });
            }
        }

        return results;
    }

    /**
     * Validate if the stored token is still valid
     * @returns Validation result with status and message
     */
    async validateToken(): Promise<TokenValidation> {
        try {
            // Try to check Genshin daily info to validate token
            const response = await this.client.get(
                "https://sg-hk4e-api.hoyolab.com/event/sol/info?lang=en-us&act_id=e202102251931481"
            );

            if (response.data.retcode === 0) {
                return { valid: true, message: "Token valid" };
            }

            return { valid: false, message: response.data.message || "Invalid token" };
        } catch (error: unknown) {
            const err = error as { message?: string };
            return { valid: false, message: err.message || "Validation failed" };
        }
    }

    /**
     * Get all game accounts for a specific game
     * @param gameKey - Game identifier
     * @returns Array of game accounts
     */
    async getGameAccounts(gameKey: string): Promise<GameAccount[]> {
        const game = HOYOLAB_GAMES[gameKey];
        if (!game) return [];

        try {
            const url = `https://api-os-takumi.mihoyo.com/binding/api/getUserGameRolesByCookie?game_biz=${game.bizName}`;
            const response = await this.client.get(url);

            if (response.data.retcode === 0 && response.data.data?.list) {
                return response.data.data.list;
            }
            return [];
        } catch (error) {
            logger.error({ msg: `Error fetching accounts for ${gameKey}`, err: error });
            return [];
        }
    }

    /**
     * Redeem a gift code for a specific account
     * @param gameKey - Game identifier
     * @param account - Target game account
     * @param code - Redemption code to use
     * @returns Redemption result with success status and message
     */
    async redeemCode(gameKey: string, account: GameAccount, code: string): Promise<RedeemResult> {
        const game = HOYOLAB_GAMES[gameKey];
        if (!game) return { success: false, message: "Unknown game" };

        if (!this.token.includes("cookie_token") && !this.token.includes("cookie_token_v2")) {
            return {
                success: false,
                message: "Cookie missing `cookie_token`. Please get a fresh cookie from the official redemption page."
            };
        }

        // Determine base URL based on game
        const baseUrl = HOYOLAB_REDEEM_URLS[gameKey] || "https://sg-hk4e-api.hoyolab.com";

        const params = new URLSearchParams({
            uid: String(account.game_uid),
            region: account.region,
            lang: "en",
            cdkey: code,
            game_biz: game.bizName
        });

        const url = `${baseUrl}/common/apicdkey/api/webExchangeCdkeyHyl?${params.toString()}`;

        try {
            logger.debug({ uid: account.game_uid, game: gameKey }, "[Redeem] Attempting to redeem");
            logger.debug({ uid: account.game_uid, game: gameKey, region: account.region }, "[Redeem] Request params");

            const headers = {
                "x-rpc-app_version": "1.5.0",
                "x-rpc-client_type": "5",
                "x-rpc-language": "en-us",
                DS: this.generateDS(),
                Cookie: this.token,
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Origin: "https://act.hoyolab.com",
                Referer: "https://act.hoyolab.com/"
            };

            const response = await this.client.get(url, { headers });
            const data = response.data;

            logger.debug({ code, retcode: data.retcode, message: data.message }, "[Redeem] Response");

            if (data.retcode === 0) {
                return { success: true, message: "Redeemed successfully" };
            }

            return { success: false, message: data.message };
        } catch (error: unknown) {
            const err = error as { message?: string };
            return { success: false, message: err.message || "Request failed" };
        }
    }
}

/**
 * Format claim results for Discord display
 * @param results - Array of claim results
 * @returns Formatted string with emoji indicators
 */
export function formatHoyolabResults(results: ClaimResult[]): string {
    if (results.length === 0) {
        return "No games configured for claiming";
    }

    return results
        .map(r => {
            const icon = r.success ? (r.alreadyClaimed ? "🔄" : "✅") : "❌";
            return `${icon} **${r.game}**: ${r.message}`;
        })
        .join("\n");
}
