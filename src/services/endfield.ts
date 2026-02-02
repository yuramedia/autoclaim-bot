import axios from "axios";

export interface EndfieldClaimResult {
    success: boolean;
    message: string;
    alreadyClaimed?: boolean;
}

// Exact URL from canaria3406/skport-auto-sign
const ATTENDANCE_URL = "https://zonai.skport.com/web/v1/game/endfield/attendance";

// Exact headers from canaria3406/skport-auto-sign
const DEFAULT_HEADERS = {
    Accept: "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0"
};

export class EndfieldService {
    private SK_OAUTH_CRED_KEY: string;
    private id: string;
    private server: string;
    private language: string;

    constructor(SK_OAUTH_CRED_KEY: string, id: string, server: string = "2", language: string = "en") {
        this.SK_OAUTH_CRED_KEY = SK_OAUTH_CRED_KEY;
        this.id = id;
        this.server = server;
        this.language = language;
    }

    /**
     * Validates if the provided parameters are in correct format
     */
    static validateParams(skOAuthCredKey: string, id: string, server: string): { valid: boolean; message?: string } {
        console.log(`[Endfield] Validating params - UID: ${id}, Server: ${server}, Token length: ${skOAuthCredKey?.length || 0}`);

        if (!skOAuthCredKey || skOAuthCredKey.length < 20) {
            console.log(`[Endfield] ❌ Validation failed: Token too short`);
            return { valid: false, message: "❌ Token too short. Provide valid SK_OAUTH_CRED_KEY." };
        }
        if (!id || !/^\d+$/.test(id)) {
            console.log(`[Endfield] ❌ Validation failed: Game UID must be numeric`);
            return { valid: false, message: "❌ Game UID must be numeric." };
        }
        if (server !== "2" && server !== "3") {
            console.log(`[Endfield] ❌ Validation failed: Invalid server`);
            return { valid: false, message: "❌ Invalid server. Use 2 (Asia) or 3 (Americas/Europe)." };
        }
        console.log(`[Endfield] ✅ Validation passed`);
        return { valid: true };
    }

    async claim(): Promise<EndfieldClaimResult> {
        // Build headers exactly like canaria3406
        const headers = {
            ...DEFAULT_HEADERS,
            cred: this.SK_OAUTH_CRED_KEY,
            "sk-game-role": `3_${this.id}_${this.server}`,
            "sk-language": this.language
        };

        console.log(`[Endfield] Attempting claim for UID: ${this.id}, Server: ${this.server}`);
        console.log(`[Endfield] URL: ${ATTENDANCE_URL}`);
        console.log(`[Endfield] Headers:`, {
            ...headers,
            cred: headers.cred.substring(0, 20) + "..." // Mask token for security
        });

        try {
            const response = await axios.post(
                ATTENDANCE_URL,
                {},
                {
                    headers,
                    timeout: 30000
                }
            );

            const responseJson = response.data;
            const checkInResult = responseJson.message || "Unknown";

            console.log(`[Endfield] Response status: ${response.status}`);
            console.log(`[Endfield] Response data:`, JSON.stringify(responseJson));

            // OK = success (exactly like canaria3406 checks)
            if (checkInResult === "OK") {
                console.log(`[Endfield] ✅ Claim successful!`);
                return {
                    success: true,
                    message: "OK"
                };
            }

            // Already claimed or other message
            const isAlreadyClaimed = checkInResult.includes("already") || checkInResult.includes("Already");
            console.log(`[Endfield] ${isAlreadyClaimed ? "🔄" : "⚠️"} Result: ${checkInResult}`);

            return {
                success: isAlreadyClaimed,
                message: checkInResult,
                alreadyClaimed: isAlreadyClaimed
            };
        } catch (error: any) {
            console.error(`[Endfield] ❌ Request error:`, error.message);

            // Handle axios error responses
            if (error.response) {
                console.error(`[Endfield] Error status: ${error.response.status}`);
                console.error(`[Endfield] Error data:`, JSON.stringify(error.response.data));

                const checkInResult = error.response.data?.message || "Request failed";
                return {
                    success: false,
                    message: checkInResult
                };
            }

            // Network or other errors
            console.error(`[Endfield] Network/other error:`, error.code || error.message);
            return {
                success: false,
                message: error.message || "Request failed"
            };
        }
    }
}

export function formatEndfieldResult(result: EndfieldClaimResult): string {
    if (result.success) {
        if (result.alreadyClaimed) {
            return `🔄 **Arknights: Endfield**: ${result.message}`;
        }
        return `✅ **Arknights: Endfield**: ${result.message}`;
    }
    return `❌ **Arknights: Endfield**: ${result.message}`;
}
