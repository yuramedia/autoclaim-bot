/**
 * Code Source Service
 * Fetches active redeem codes from Hashblen API
 */

import axios from "axios";
import { logger } from "../core/logger";
import type { RedeemCode, HashblenResponse } from "../types";

// Re-export types for backwards compatibility
export type { RedeemCode, HashblenResponse };

/** API endpoint for redeem codes */
const CODE_SOURCE_URL = "https://db.hashblen.com/codes";

/**
 * Fetch all active redeem codes
 * @returns Response with codes for all supported games, or null on error
 */
export async function getCodes(): Promise<HashblenResponse | null> {
    try {
        const response = await axios.get<HashblenResponse>(CODE_SOURCE_URL, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            },
            timeout: 10000
        });

        if (response.status === 200 && response.data) {
            return response.data;
        }
        return null;
    } catch (error) {
        logger.error(error as Error, "Failed to fetch codes from Hashblen");
        return null;
    }
}
