/**
 * Endfield/SKPORT API Constants
 * Configuration for Endfield API endpoints
 * Reference: https://github.com/Areha11Fz/ArknightsEndfieldAutoCheckIn
 */

/**
 * App code for OAuth grant.
 */
export const ENDFIELD_APP_CODE = "6eb76d4e13aa36e6";

/**
 * OAuth grant URL (get OAuth code from ACCOUNT_TOKEN).
 */
export const ENDFIELD_GRANT_URL = "https://as.gryphline.com/user/oauth2/v2/grant";

/**
 * Generate cred from OAuth code (returns both cred and salt/signToken).
 */
export const ENDFIELD_GENERATE_CRED_URL = "https://zonai.skport.com/web/v1/user/auth/generate_cred_by_code";

/**
 * Player binding URL (get game roles).
 */
export const ENDFIELD_BINDING_URL = "https://zonai.skport.com/api/v1/game/player/binding";

/**
 * Player binding path.
 */
export const ENDFIELD_BINDING_PATH = "/api/v1/game/player/binding";

/**
 * Endfield attendance API URL.
 */
export const ENDFIELD_ATTENDANCE_URL = "https://zonai.skport.com/web/v1/game/endfield/attendance";

/**
 * Endfield attendance path.
 */
export const ENDFIELD_ATTENDANCE_PATH = "/web/v1/game/endfield/attendance";

/**
 * Endfield game ID in SKPORT system.
 */
export const ENDFIELD_GAME_ID = "3";

/**
 * Default platform for Endfield requests.
 */
export const ENDFIELD_PLATFORM = "3";

/**
 * Default version name for Endfield requests.
 */
export const ENDFIELD_VERSION = "1.0.0";
