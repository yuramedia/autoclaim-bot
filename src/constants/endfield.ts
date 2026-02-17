/**
 * Endfield/SKPORT API Constants
 * Configuration for Endfield API endpoints
 * Based on: https://github.com/canaria3406/skport-auto-sign
 */

/** Endfield attendance API URL */
export const ENDFIELD_ATTENDANCE_URL = "https://zonai.skport.com/web/v1/game/endfield/attendance";

/** Endfield attendance path (used for signing) */
export const ENDFIELD_ATTENDANCE_PATH = "/web/v1/game/endfield/attendance";

/** Endfield request headers template (matching reference) */
export const ENDFIELD_HEADERS = {
    Accept: "*/*",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:147.0) Gecko/20100101 Firefox/147.0",
    Referer: "https://game.skport.com/",
    platform: "3",
    vName: "1.0.0",
    Origin: "https://game.skport.com",
    Connection: "keep-alive",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    Priority: "u=0",
    TE: "trailers"
} as const;

/** Valid Endfield server IDs */
export const ENDFIELD_VALID_SERVERS = ["2", "3"] as const;

/** Default platform for Endfield requests */
export const ENDFIELD_PLATFORM = "3";

/** Default version name for Endfield requests */
export const ENDFIELD_VERSION = "1.0.0";

/** Response code indicating token has expired */
export const ENDFIELD_TOKEN_EXPIRED_CODE = 10000;
