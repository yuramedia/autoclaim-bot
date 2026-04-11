/**
 * Crunchyroll Constants
 * Configuration for Crunchyroll service
 */

/** Crunchyroll brand color (orange) */
export const CRUNCHYROLL_COLOR = 0xf47521;

/** Poll interval for checking new episodes (2 minutes) */
export const CRUNCHYROLL_POLL_INTERVAL = 2 * 60 * 1000;

/** Season names in order */
export const CR_SEASONS = ["winter", "spring", "summer", "fall"] as const;

/** Number of items per cr-release embed page */
export const CR_RELEASE_ITEMS_PER_PAGE = 100;

/** Cache TTL for valid seasons (30 minutes) */
export const CR_SEASON_CACHE_TTL = 30 * 60 * 1000;

/** Cache of last seen episode IDs (in-memory, capped to prevent memory leak) */
export const MAX_SEEN_EPISODES = 500;

/** Max episodes to send per guild per feed cycle */
export const MAX_EPISODES_PER_CYCLE = 100;

/** Delay between feed messages to a guild (ms) */
export const MESSAGE_DELAY = 2000;

/** Map of episode id -> title for tracking edits */
export const seenEpisodes = new Map<string, string>();

/** Lock state to prevent concurrent feed checks */
export const feedLock = { isChecking: false };
