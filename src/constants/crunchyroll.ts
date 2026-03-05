/**
 * Crunchyroll Constants
 * Configuration for Crunchyroll service
 */

/** Crunchyroll brand color (orange) */
export const CRUNCHYROLL_COLOR = 0xf47521;

/** Poll interval for checking new episodes (5 minutes) */
export const CRUNCHYROLL_POLL_INTERVAL = 5 * 60 * 1000;

/** Season names in order */
export const CR_SEASONS = ["winter", "spring", "summer", "fall"] as const;

/** Number of items per cr-release embed page */
export const CR_RELEASE_ITEMS_PER_PAGE = 10;

/** Cache TTL for valid seasons (30 minutes) */
export const CR_SEASON_CACHE_TTL = 30 * 60 * 1000;
