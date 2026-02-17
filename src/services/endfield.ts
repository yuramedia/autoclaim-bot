/**
 * Endfield Service
 * Handles daily check-in for Arknights: Endfield via SKPORT API
 * Based on: https://github.com/canaria3406/skport-auto-sign
 */

import crypto from "crypto";
import axios from "axios";
import type {
    AttendanceReward,
    AttendanceResourceInfo,
    EndfieldClaimResult,
    EndfieldServiceOptions,
    EndfieldValidation
} from "../types";
import {
    ENDFIELD,
    ENDFIELD_ATTENDANCE_URL,
    ENDFIELD_ATTENDANCE_PATH,
    ENDFIELD_HEADERS,
    ENDFIELD_VALID_SERVERS,
    ENDFIELD_PLATFORM,
    ENDFIELD_TOKEN_EXPIRED_CODE
} from "../constants";

// Re-export types for backwards compatibility
export type { EndfieldClaimResult, EndfieldServiceOptions };

/**
 * Generate sign for SKPORT API requests
 * Matches the reference implementation from canaria3406/skport-auto-sign:
 * 1. Build string: path + body + timestamp + JSON({platform, timestamp, dId, vName})
 * 2. HMAC-SHA256 with SK_TOKEN_CACHE_KEY
 * 3. MD5 the HMAC result
 *
 * @param path - API endpoint path
 * @param method - HTTP method
 * @param headers - Request headers (must include timestamp, platform, dId, vName)
 * @param body - Request body (empty string for GET)
 * @param token - SK_TOKEN_CACHE_KEY for signing
 * @returns MD5 hex string of HMAC-SHA256 signature
 */
function generateSign(
    path: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    token: string
): string {
    // Build the string to sign
    let stringToSign = path + (method === "GET" ? "" : body);

    if (headers.timestamp) {
        stringToSign += headers.timestamp;
    }

    // Build header object in exact order as reference
    const headerObj: Record<string, string> = {};
    for (const key of ["platform", "timestamp", "dId", "vName"]) {
        if (headers[key]) {
            headerObj[key] = headers[key];
        } else if (key === "dId") {
            headerObj[key] = "";
        }
    }

    stringToSign += JSON.stringify(headerObj);

    // HMAC-SHA256 then MD5
    const hmacHex = crypto.createHmac("sha256", token).update(stringToSign).digest("hex");
    return crypto.createHash("md5").update(hmacHex).digest("hex");
}

/**
 * Parse rewards from API response
 */
function parseRewards(
    awardIds: Array<{ id?: string }> | undefined,
    resourceInfoMap: Record<string, AttendanceResourceInfo> | undefined
): AttendanceReward[] {
    if (!Array.isArray(awardIds) || !resourceInfoMap) return [];
    const rewards: AttendanceReward[] = [];
    for (const entry of awardIds) {
        if (entry?.id) {
            const info = resourceInfoMap[entry.id];
            if (info) {
                rewards.push({
                    id: info.id,
                    name: info.name,
                    count: info.count,
                    icon: info.icon
                });
            }
        }
    }
    return rewards;
}

/**
 * Service class for interacting with SKPORT/Endfield API
 * Uses SK_OAUTH_CRED_KEY (cookie) and SK_TOKEN_CACHE_KEY (localStorage) directly
 */
export class EndfieldService {
    private cred: string;
    private skTokenCacheKey: string;
    private skGameRole: string;
    private language: string;

    /**
     * Create a new EndfieldService instance
     * @param options - Configuration options
     */
    constructor(options: EndfieldServiceOptions) {
        this.cred = options.cred;
        this.skTokenCacheKey = options.skTokenCacheKey;
        this.skGameRole = `${ENDFIELD_PLATFORM}_${options.gameId}_${options.server || "2"}`;
        this.language = options.language || "en";
    }

    /**
     * Validates if the provided parameters are in correct format
     * @param cred - SK_OAUTH_CRED_KEY from cookie
     * @param skTokenCacheKey - SK_TOKEN_CACHE_KEY from localStorage
     * @param id - Game UID
     * @param server - Server ID (2 or 3)
     * @returns Validation result
     */
    static validateParams(cred: string, skTokenCacheKey: string, id: string, server: string): EndfieldValidation {
        if (!cred || cred.length < 10) {
            return { valid: false, message: "❌ Invalid SK_OAUTH_CRED_KEY (too short)" };
        }

        if (!skTokenCacheKey || skTokenCacheKey.length < 10) {
            return { valid: false, message: "❌ Invalid SK_TOKEN_CACHE_KEY (too short)" };
        }

        if (!id || !/^\d+$/.test(id)) {
            return { valid: false, message: "❌ Invalid Game ID (must be numbers only)" };
        }

        if (server && !ENDFIELD_VALID_SERVERS.includes(server as (typeof ENDFIELD_VALID_SERVERS)[number])) {
            return {
                valid: false,
                message: `❌ Invalid server (use 2 for ${ENDFIELD.servers["2"]} or 3 for ${ENDFIELD.servers["3"]})`
            };
        }

        return { valid: true };
    }

    /**
     * Check-in and claim daily rewards
     * @returns Claim result with rewards if successful
     */
    async claim(): Promise<EndfieldClaimResult> {
        const timestamp = Math.floor(Date.now() / 1000).toString();

        // Build headers matching reference exactly
        const headers: Record<string, string> = {
            ...ENDFIELD_HEADERS,
            cred: this.cred,
            "sk-game-role": this.skGameRole,
            "sk-language": this.language,
            timestamp
        };

        // Generate sign using SK_TOKEN_CACHE_KEY
        headers.sign = generateSign(ENDFIELD_ATTENDANCE_PATH, "POST", headers, "", this.skTokenCacheKey);

        console.log("[Endfield] Sending attendance request...");
        console.log("[Endfield] sk-game-role:", this.skGameRole);

        try {
            const response = await axios.post(
                ENDFIELD_ATTENDANCE_URL,
                {},
                {
                    headers,
                    validateStatus: () => true
                }
            );

            console.log("[Endfield] Response status:", response.status);
            console.log("[Endfield] Response data:", JSON.stringify(response.data));

            const data = response.data;

            if (response.status !== 200) {
                return {
                    success: false,
                    message: `HTTP ${response.status}: ${data?.message || data?.msg || "Request failed"}`
                };
            }

            const code = data?.code ?? data?.retcode;
            const msg = data?.msg ?? data?.message ?? "Attendance response received";

            // Handle token expired (code 10000)
            if (code === ENDFIELD_TOKEN_EXPIRED_CODE) {
                return {
                    success: false,
                    message:
                        "⚠️ Token expired! Please update SK_OAUTH_CRED_KEY and SK_TOKEN_CACHE_KEY via `/setup-endfield`.",
                    tokenExpired: true
                };
            }

            if (code === 0) {
                const rewards = parseRewards(data?.data?.awardIds, data?.data?.resourceInfoMap);
                const message = msg === "OK" ? "Check-in successful" : msg;

                return {
                    success: true,
                    message,
                    rewards: rewards.length > 0 ? rewards : undefined
                };
            }

            // Check if already claimed
            const already =
                typeof msg === "string" && (msg.toLowerCase().includes("already") || data?.data?.hasToday === true);

            if (already) {
                return {
                    success: true,
                    message: "Already checked in today",
                    already: true
                };
            }

            return {
                success: false,
                message: msg
            };
        } catch (error: any) {
            console.error("[Endfield] Claim error:", error.message);
            return {
                success: false,
                message: error.message || "Network error"
            };
        }
    }
}

/**
 * Format claim result for display
 * @param result - Claim result to format
 * @returns Formatted string with emoji and game name
 */
export function formatEndfieldResult(result: EndfieldClaimResult): string {
    const gameName = ENDFIELD.name;

    if (result.tokenExpired) {
        return `⚠️ **${gameName}**: ${result.message}`;
    }

    if (!result.success && !result.already) {
        return `❌ **${gameName}**: ${result.message}`;
    }

    if (result.already) {
        return `✅ **${gameName}**: Already claimed today`;
    }

    let msg = `✅ **${gameName}**: ${result.message}`;
    if (result.rewards && result.rewards.length > 0) {
        const rewardList = result.rewards.map(r => `• ${r.name} x${r.count || 1}`).join("\n");
        msg += `\n${rewardList}`;
    }

    return msg;
}
