/**
 * Endfield/SKPORT API Types
 * Type definitions for Endfield service interactions
 */

/** Reward from attendance check-in */
export interface AttendanceReward {
    id?: string;
    name: string;
    count?: number;
    icon?: string;
}

/** Resource info from API response */
export interface AttendanceResourceInfo {
    id: string;
    count: number;
    name: string;
    icon: string;
}

/** Result of an Endfield claim attempt */
export interface EndfieldClaimResult {
    success: boolean;
    message: string;
    rewards?: AttendanceReward[];
    already?: boolean;
    tokenExpired?: boolean;
}

/** Options for creating EndfieldService */
export interface EndfieldServiceOptions {
    /** SK_OAUTH_CRED_KEY from cookie */
    cred: string;
    /** SK_TOKEN_CACHE_KEY from localStorage (used for signing) */
    skTokenCacheKey: string;
    /** Endfield game UID */
    gameId: string;
    /** Server: "2" for Asia, "3" for Americas/Europe */
    server?: string;
    /** Language code (default: "en") */
    language?: string;
}

/** Validation result for Endfield parameters */
export interface EndfieldValidation {
    valid: boolean;
    message?: string;
}
