import crypto from "crypto";
import axios from "axios";

const ATTENDANCE_URL = "https://zonai.skport.com/web/v1/game/endfield/attendance";

interface EndfieldProfile {
    cred: string;
    skGameRole: string;
    platform: string;
    vName: string;
    signToken?: string;
    deviceId?: string;
}

interface AttendanceReward {
    id?: string;
    name: string;
    count?: number;
    icon?: string;
}

interface AttendanceResourceInfo {
    id: string;
    count: number;
    name: string;
    icon: string;
}

export interface EndfieldClaimResult {
    success: boolean;
    message: string;
    rewards?: AttendanceReward[];
    already?: boolean;
}

interface SignInput {
    url: string;
    method: string;
    body?: string;
    timestamp: string;
    platform: string;
    vName: string;
    deviceId?: string;
    key: string;
}

/**
 * Build sign payload according to FlamingFox911 logic
 */
function buildSignPayload(input: SignInput): string {
    const url = new URL(input.url);
    const path = url.pathname;
    const query = url.search ? url.search.slice(1) : "";
    const method = input.method.toUpperCase();
    const body = input.body ?? "";

    let source = "";
    source += path;
    source += method === "GET" ? query : body;
    source += input.timestamp;

    const payload = {
        platform: input.platform,
        timestamp: input.timestamp,
        dId: input.deviceId ?? "",
        vName: input.vName
    };

    source += JSON.stringify(payload);

    return source;
}

/**
 * Build signing headers (HMAC-SHA256 + MD5)
 */
function buildSignHeaders(
    profile: EndfieldProfile,
    url: string,
    method: string,
    body?: string
): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const headers: Record<string, string> = {
        platform: profile.platform,
        vName: profile.vName,
        timestamp
    };

    if (profile.deviceId) {
        headers.dId = profile.deviceId;
    }

    const key = profile.signToken;
    if (key) {
        const source = buildSignPayload({
            url,
            method,
            body,
            timestamp,
            platform: profile.platform,
            vName: profile.vName,
            deviceId: profile.deviceId,
            key
        });
        const hmacHex = crypto.createHmac("sha256", key).update(source).digest("hex");
        headers.sign = crypto.createHash("md5").update(hmacHex).digest("hex");
    }

    return headers;
}

/**
 * Build full request headers
 */
function buildHeaders(profile: EndfieldProfile, signHeaders: Record<string, string>): Record<string, string> {
    return {
        cred: profile.cred,
        "sk-game-role": profile.skGameRole,
        ...signHeaders,
        accept: "*/*",
        "content-type": "application/json",
        origin: "https://game.skport.com",
        referer: "https://game.skport.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0",
        "accept-language": "en-CA,en-US;q=0.9,en;q=0.8",
        "accept-encoding": "gzip, deflate, br, zstd",
        dnt: "1",
        priority: "u=4",
        "sk-language": "en",
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
        te: "trailers"
    };
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

export interface EndfieldServiceOptions {
    cred: string;
    gameId: string;
    server?: string;
    signToken?: string;
}

export class EndfieldService {
    private profile: EndfieldProfile;

    constructor(options: EndfieldServiceOptions) {
        this.profile = {
            cred: options.cred,
            skGameRole: `3_${options.gameId}_${options.server || "2"}`,
            platform: "3",
            vName: "1.0.0",
            signToken: options.signToken,
            deviceId: undefined
        };
    }

    /**
     * Validates if the provided parameters are in correct format
     */
    static validateParams(cred: string, id: string, server: string): { valid: boolean; message?: string } {
        if (!cred || cred.length < 10) {
            return { valid: false, message: "❌ Invalid cred token (too short)" };
        }

        if (!id || !/^\d+$/.test(id)) {
            return { valid: false, message: "❌ Invalid Game ID (must be numbers only)" };
        }

        if (server && !["2", "3"].includes(server)) {
            return { valid: false, message: "❌ Invalid server (use 2 for Asia or 3 for Americas/EU)" };
        }

        return { valid: true };
    }

    /**
     * Check-in and claim daily rewards
     */
    async claim(): Promise<EndfieldClaimResult> {
        const body = "{}";
        const signHeaders = buildSignHeaders(this.profile, ATTENDANCE_URL, "POST", body);
        const headers = buildHeaders(this.profile, signHeaders);

        console.log("[Endfield] Sending attendance request...");
        console.log("[Endfield] sk-game-role:", this.profile.skGameRole);

        try {
            const response = await axios.post(ATTENDANCE_URL, body, {
                headers,
                validateStatus: () => true
            });

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
 */
export function formatEndfieldResult(result: EndfieldClaimResult): string {
    if (!result.success && !result.already) {
        return `❌ **Arknights: Endfield**: ${result.message}`;
    }

    if (result.already) {
        return `✅ **Arknights: Endfield**: Already claimed today`;
    }

    let msg = `✅ **Arknights: Endfield**: ${result.message}`;
    if (result.rewards && result.rewards.length > 0) {
        const rewardList = result.rewards.map(r => `• ${r.name} x${r.count || 1}`).join("\n");
        msg += `\n${rewardList}`;
    }

    return msg;
}
