/**
 * Endfield Service
 * Handles daily check-in for Arknights: Endfield via SKPORT API
 * Uses dynamic token refresh from ACCOUNT_TOKEN (long-lasting)
 * Reference: https://github.com/Areha11Fz/ArknightsEndfieldAutoCheckIn
 */

import crypto from "crypto";
import { logger } from "../core/logger";
import type { EndfieldClaimResult, EndfieldRoleResult, EndfieldServiceOptions, EndfieldValidation } from "../types";
import {
    ENDFIELD,
    ENDFIELD_APP_CODE,
    ENDFIELD_GRANT_URL,
    ENDFIELD_GENERATE_CRED_URL,
    ENDFIELD_BINDING_URL,
    ENDFIELD_BINDING_PATH,
    ENDFIELD_ATTENDANCE_URL,
    ENDFIELD_ATTENDANCE_PATH,
    ENDFIELD_GAME_ID,
    ENDFIELD_PLATFORM,
    ENDFIELD_VERSION
} from "../constants";

// Re-export types for backwards compatibility
export type { EndfieldClaimResult, EndfieldServiceOptions };

// ── Crypto ──────────────────────────────────────────────────────────────

/**
 * Compute V2 sign for SKPORT API requests (HMAC-SHA256 + MD5)
 * Used for both player binding and attendance requests
 * Reference: Areha11Fz/ArknightsEndfieldAutoCheckIn - generateSignV2
 * @param path - API path
 * @param body - Request body
 * @param timestamp - Request timestamp
 * @param signToken - Secret sign token (salt)
 * @returns Computed signature string
 */
function computeSignV2(path: string, body: string, timestamp: string, signToken: string): string {
    const headerObj = {
        platform: ENDFIELD_PLATFORM,
        timestamp,
        dId: "",
        vName: ENDFIELD_VERSION
    };
    const signString = path + body + timestamp + JSON.stringify(headerObj);
    const hmacHex = crypto.createHmac("sha256", signToken).update(signString).digest("hex");
    return crypto.createHash("md5").update(hmacHex).digest("hex");
}

// ── Auth Pipeline ───────────────────────────────────────────────────────

/**
 * Step 1: Exchange ACCOUNT_TOKEN for an OAuth code
 * POST https://as.gryphline.com/user/oauth2/v2/grant
 * @param accountToken - The user's account token
 * @returns OAuth code string or null if failed
 */
async function getOAuthCode(accountToken: string): Promise<string | null> {
    try {
        const payload = { token: accountToken, appCode: ENDFIELD_APP_CODE, type: 0 };
        const response = await fetch(ENDFIELD_GRANT_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = (await response.json()) as { status?: number; data?: { code?: string } };
        return json.status === 0 && json.data?.code ? json.data.code : null;
    } catch (error) {
        logger.error(error as Error, "[Endfield] getOAuthCode error");
        return null;
    }
}

/**
 * Credential response from generate_cred_by_code
 * Returns both cred (session credential) and salt (sign token)
 */
interface CredResponse {
    cred: string;
    salt: string;
    userId?: string;
}

/**
 * Step 2: Exchange OAuth code for cred and salt (sign token)
 * POST https://zonai.skport.com/web/v1/user/auth/generate_cred_by_code
 * Reference: Areha11Fz/ArknightsEndfieldAutoCheckIn - returns both cred and salt (signToken)
 * @param oauthCode - The OAuth code obtained from getOAuthCode
 * @returns CredResponse with cred and salt, or null if failed
 */
async function getCredAndSalt(oauthCode: string): Promise<CredResponse | null> {
    try {
        const payload = { kind: 1, code: oauthCode };
        const response = await fetch(ENDFIELD_GENERATE_CRED_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const json = (await response.json()) as {
            code?: number;
            data?: { cred?: string; token?: string; userId?: string };
        };
        if (json.code === 0 && json.data?.cred && json.data?.token) {
            return {
                cred: json.data.cred,
                salt: json.data.token,
                userId: json.data.userId
            };
        }
        return null;
    } catch (error) {
        logger.error(error as Error, "[Endfield] getCredAndSalt error");
        return null;
    }
}

/**
 * Get player bindings to find all Endfield game roles
 * GET https://zonai.skport.com/api/v1/game/player/binding
 * Returns array of game role strings like "3_{roleId}_{serverId}"
 * @param cred - The session credential
 * @param signToken - The sign token
 * @returns Array of role strings
 */
async function getPlayerBindings(cred: string, signToken: string): Promise<string[]> {
    try {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const signature = computeSignV2(ENDFIELD_BINDING_PATH, "", timestamp, signToken);
        const headers: Record<string, string> = {
            cred,
            platform: ENDFIELD_PLATFORM,
            vname: ENDFIELD_VERSION,
            timestamp,
            "sk-language": "en",
            sign: signature,
            // Additional headers from reference implementation
            "User-Agent": "Skport/0.7.0 (com.gryphline.skport; build:700089; Android 33; ) Okhttp/5.1.0",
            Origin: "https://game.skport.com",
            Referer: "https://game.skport.com/"
        };
        const response = await fetch(ENDFIELD_BINDING_URL, {
            method: "GET",
            headers
        });

        interface BindingRole {
            roleId: string;
            serverId: string;
        }
        interface BindingApp {
            appCode: string;
            bindingList?: Array<{ roles: BindingRole[] }>;
        }
        interface BindingResponse {
            code?: number;
            data?: { list?: BindingApp[] };
        }

        const json = (await response.json()) as BindingResponse;
        const roles: string[] = [];

        if (json.code === 0 && json.data?.list) {
            for (const app of json.data.list) {
                if (app.appCode === "endfield" && app.bindingList) {
                    for (const binding of app.bindingList) {
                        for (const role of binding.roles) {
                            roles.push(`${ENDFIELD_GAME_ID}_${role.roleId}_${role.serverId}`);
                        }
                    }
                }
            }
        }
        return roles;
    } catch (error) {
        logger.error(error as Error, "[Endfield] getPlayerBindings error");
        return [];
    }
}

// ── Attendance ──────────────────────────────────────────────────────────

/**
 * Send attendance request for a single game role
 * Uses V2 signature with salt (signToken) from getCredAndSalt
 * @param cred - The session credential
 * @param signToken - The sign token (salt) from getCredAndSalt
 * @param gameRole - Game role identifier
 * @param language - Language code for reward names
 * @returns Promise with API response
 */
async function sendAttendanceRequest(
    cred: string,
    signToken: string,
    gameRole: string,
    language: string
): Promise<{ code?: number; message?: string; data?: unknown }> {
    try {
        const timestamp = String(Math.floor(Date.now() / 1000));
        const signature = computeSignV2(ENDFIELD_ATTENDANCE_PATH, "", timestamp, signToken);
        const headers: Record<string, string> = {
            cred,
            platform: ENDFIELD_PLATFORM,
            vname: ENDFIELD_VERSION,
            timestamp,
            "sk-language": language,
            sign: signature,
            "Content-Type": "application/json",
            "sk-game-role": gameRole,
            // Additional headers from reference implementation
            "User-Agent": "Skport/0.7.0 (com.gryphline.skport; build:700089; Android 33; ) Okhttp/5.1.0",
            Origin: "https://game.skport.com",
            Referer: "https://game.skport.com/"
        };
        const response = await fetch(ENDFIELD_ATTENDANCE_URL, {
            method: "POST",
            headers
        });
        return (await response.json()) as { code?: number; message?: string; data?: unknown };
    } catch (error) {
        logger.error(error as Error, "[Endfield] sendAttendanceRequest error");
        return { code: -1, message: "Network error in sendAttendanceRequest" };
    }
}

/**
 * Parse rewards from attendance response data
 * @param data - The API response data object
 * @returns Rewards description string
 */
function parseRewards(data: unknown): string {
    if (!data) return "No rewards data";
    const d = data as {
        reward?: { name: string; count: number };
        awardIds?: Array<{ id: string }>;
        resourceInfoMap?: Record<string, { name: string; count: number }>;
    };
    if (d.reward) return `${d.reward.name} x${d.reward.count}`;
    if (d.awardIds && d.resourceInfoMap) {
        const items: string[] = [];
        for (const award of d.awardIds) {
            const info = d.resourceInfoMap[award.id];
            if (info) items.push(`${info.name} x${info.count}`);
        }
        return items.length > 0 ? items.join(", ") : "No rewards data";
    }
    return "No rewards data";
}

// ── Service Class ───────────────────────────────────────────────────────

/**
 * Service class for SKPORT/Endfield auto-claim.
 * Uses ACCOUNT_TOKEN for dynamic auth (no daily expiry).
 */
export class EndfieldService {
    private accountToken: string;
    private language: string;

    constructor(options: EndfieldServiceOptions) {
        this.accountToken = options.accountToken;
        this.language = options.language || "en";
    }

    /**
     * Validate ACCOUNT_TOKEN format.
     * @param accountToken - The token to validate.
     * @returns Validation result.
     */
    static validateParams(accountToken: string): EndfieldValidation {
        if (!accountToken || accountToken.trim().length < 10) {
            return { valid: false, message: "❌ Invalid ACCOUNT_TOKEN (too short)" };
        }
        return { valid: true };
    }

    /**
     * Run the full auth pipeline and claim daily rewards for all game roles.
     * @returns Claim results.
     */
    async claim(): Promise<EndfieldClaimResult> {
        logger.info("[Endfield] Starting auth pipeline...");

        // Step 1: Get OAuth code from ACCOUNT_TOKEN
        // Token is now stored in decoded form (URI-decoded at entry point in endfield-modal),
        // so no decodeURIComponent needed here.
        const oauthCode = await getOAuthCode(this.accountToken);
        if (!oauthCode) {
            return {
                success: false,
                message:
                    "⚠️ Failed to get OAuth code — ACCOUNT_TOKEN may be expired. Please update via `/setup-endfield`.",
                tokenExpired: true
            };
        }
        logger.info("[Endfield] OAuth code obtained");

        // Step 2: Generate cred and salt (signToken) in one call
        // Reference: Areha11Fz/ArknightsEndfieldAutoCheckIn - generate_cred_by_code returns both
        const credData = await getCredAndSalt(oauthCode);
        if (!credData) {
            return { success: false, message: "❌ Failed to generate credential from OAuth code" };
        }
        const { cred, salt: signToken } = credData;
        logger.info("[Endfield] Cred and sign token obtained");

        // Step 3: Get player bindings (auto-detect all game roles)
        const gameRoles = await getPlayerBindings(cred, signToken);
        if (gameRoles.length === 0) {
            return { success: false, message: "❌ No Endfield game roles found for this account" };
        }
        logger.info(`[Endfield] Found ${gameRoles.length} game role(s): ${gameRoles.join(", ")}`);

        // Step 4: Send attendance for each role in parallel
        const rolePromises = gameRoles.map(async (gameRole): Promise<EndfieldRoleResult> => {
            try {
                const response = await sendAttendanceRequest(cred, signToken, gameRole, this.language);
                logger.info(`[Endfield] Role ${gameRole} response: ${JSON.stringify(response)}`);

                return this.handleResponse(gameRole, response);
            } catch (error: unknown) {
                const err = error as { message?: string };
                logger.error(`[Endfield] Role ${gameRole} error: ${err.message}`);
                return {
                    gameRole,
                    success: false,
                    message: err.message || "Network error"
                };
            }
        });

        const roleResults = await Promise.all(rolePromises);
        let allSuccess = true;

        for (const result of roleResults) {
            if (!result.success && !result.already) allSuccess = false;
        }

        return {
            success: allSuccess,
            message: allSuccess ? "Check-in completed" : "Some check-ins failed",
            results: roleResults
        };
    }

    /**
     * Handle attendance response for a single role.
     * @param gameRole - Game role identifier.
     * @param json - Parsed JSON response.
     * @returns Role check-in result.
     */
    private handleResponse(
        gameRole: string,
        json: { code?: number; message?: string; data?: unknown }
    ): EndfieldRoleResult {
        const code = json.code;
        const msg = json.message || "";

        // Success (code 0)
        if (code === 0 && msg === "OK") {
            const rewards = parseRewards(json.data);
            return { gameRole, success: true, message: "Signed in successfully", rewards };
        }

        // Already signed in
        if (code === 1001 || code === 10001 || msg.toLowerCase().includes("already") || (code === 0 && msg !== "OK")) {
            return { gameRole, success: true, message: "Already signed in today", already: true };
        }

        // Token expired
        if (code === 10002) {
            return {
                gameRole,
                success: false,
                message: "ACCOUNT_TOKEN expired. Please update via `/setup-endfield`.",
                tokenExpired: true
            };
        }

        // Character not logged in / position not found
        if (code === 19001 || msg.includes("无法获取当前角色位置")) {
            return {
                gameRole,
                success: false,
                message: "Cannot get character position. Please make sure you have logged into the game."
            };
        }

        // Unknown error
        return { gameRole, success: false, message: `API Error ${code}: ${msg}` };
    }
}

// ── Formatting ──────────────────────────────────────────────────────────

/**
 * Format claim result for display.
 * @param result - Claim results.
 * @returns Human-readable formatted string.
 */
export function formatEndfieldResult(result: EndfieldClaimResult): string {
    const gameName = ENDFIELD.name;

    if (result.tokenExpired) {
        return `⚠️ **${gameName}**: ${result.message}`;
    }

    if (!result.results || result.results.length === 0) {
        const icon = result.success ? "✅" : "❌";
        return `${icon} **${gameName}**: ${result.message}`;
    }

    const lines = result.results.map(r => {
        const serverInfo = r.gameRole.split("_").slice(1).join("_");
        if (r.tokenExpired) return `⚠️ [${serverInfo}] ${r.message}`;
        if (r.already) return `✅ [${serverInfo}] Already claimed today`;
        if (!r.success) return `❌ [${serverInfo}] ${r.message}`;
        let line = `✅ [${serverInfo}] ${r.message}`;
        if (r.rewards) line += ` — ${r.rewards}`;
        return line;
    });

    return `**${gameName}**\n${lines.join("\n")}`;
}
