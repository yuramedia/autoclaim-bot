/**
 * Anime Metadata Service
 * Fetches anime relations from animeApi.my.id
 * Reference: https://github.com/nattadasu/animeApi
 */

import { logger } from "../core/logger";
import type { AnimeApiResponse, AnimeMetadata } from "../types";
import { ANIME_API_URL, ANIME_API_USER_AGENT } from "../constants";
import { fetchWithTimeout } from "../utils/http";

/** Shared request options for animeApi.my.id lookups. */
const API_OPTIONS = {
    timeoutMs: 8000,
    headers: {
        "User-Agent": ANIME_API_USER_AGENT,
        Accept: "application/json"
    }
} as const;

/**
 * Convert an anime title to a URL-safe slug for platform lookups
 * @param title - Anime title
 * @returns Clean slug string
 */
function titleToSlug(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/**
 * Search for anime by title using animeApi.my.id
 * Queries platform slug endpoints (animeplanet, kaize) on animeApi.my.id
 * @param title - Anime title to search for
 * @returns Anime metadata including MAL and Anilist IDs
 */
export async function searchAnime(title: string): Promise<AnimeMetadata | null> {
    try {
        const slug = titleToSlug(title);
        if (!slug) {
            return {
                title,
                anilistUrl: `https://anilist.co/search/anime?search=${encodeURIComponent(title)}`,
                malUrl: `https://myanimelist.net/anime.php?q=${encodeURIComponent(title)}`
            };
        }

        // Try animeplanet slug lookup first, then kaize fallback
        let response = await fetchWithTimeout(`${ANIME_API_URL}/animeplanet/${slug}`, API_OPTIONS);

        if (!response.ok) {
            response = await fetchWithTimeout(`${ANIME_API_URL}/kaize/${slug}`, API_OPTIONS);
        }

        if (response.ok) {
            const animeData = (await response.json()) as AnimeApiResponse;
            const malId = animeData.myanimelist ?? undefined;
            const anilistId = animeData.anilist ?? undefined;

            return {
                title: animeData.title || title,
                malId,
                anilistId,
                anilistUrl: anilistId
                    ? `https://anilist.co/anime/${anilistId}`
                    : `https://anilist.co/search/anime?search=${encodeURIComponent(title)}`,
                malUrl: malId
                    ? `https://myanimelist.net/anime/${malId}`
                    : `https://myanimelist.net/anime.php?q=${encodeURIComponent(title)}`
            };
        }

        // Fallback to search URLs if slug lookup is not matched
        return {
            title,
            anilistUrl: `https://anilist.co/search/anime?search=${encodeURIComponent(title)}`,
            malUrl: `https://myanimelist.net/anime.php?q=${encodeURIComponent(title)}`
        };
    } catch (error) {
        logger.error(error as Error, `AnimeApi search failed for "${title}"`);
        return {
            title,
            anilistUrl: `https://anilist.co/search/anime?search=${encodeURIComponent(title)}`,
            malUrl: `https://myanimelist.net/anime.php?q=${encodeURIComponent(title)}`
        };
    }
}

/**
 * Fetch anime data by Anilist ID
 * @param anilistId - Anilist ID
 * @returns Anime API response or null
 */
export async function fetchAnimeByAnilistId(anilistId: number): Promise<AnimeApiResponse | null> {
    try {
        const response = await fetchWithTimeout(`${ANIME_API_URL}/anilist/${anilistId}`, API_OPTIONS);

        if (!response.ok) {
            return null;
        }

        return (await response.json()) as AnimeApiResponse;
    } catch (error) {
        logger.error(error as Error, `AnimeApi fetch failed for Anilist ID ${anilistId}`);
        return null;
    }
}

/**
 * Fetch anime data by MAL ID
 * @param malId - MyAnimeList ID
 * @returns Anime API response or null
 */
export async function fetchAnimeByMalId(malId: number): Promise<AnimeApiResponse | null> {
    try {
        const response = await fetchWithTimeout(`${ANIME_API_URL}/myanimelist/${malId}`, API_OPTIONS);

        if (!response.ok) {
            return null;
        }

        return (await response.json()) as AnimeApiResponse;
    } catch (error) {
        logger.error(error as Error, `AnimeApi fetch failed for MAL ID ${malId}`);
        return null;
    }
}

/**
 * Fetch anime data by AniDB ID
 * @param anidbId - AniDB ID
 * @returns Anime API response or null
 */
export async function fetchAnimeByAnidbId(anidbId: number | string): Promise<AnimeApiResponse | null> {
    try {
        const response = await fetchWithTimeout(`${ANIME_API_URL}/anidb/${anidbId}`, API_OPTIONS);

        if (!response.ok) {
            return null;
        }

        return (await response.json()) as AnimeApiResponse;
    } catch (error) {
        logger.error(error as Error, `AnimeApi fetch failed for AniDB ID ${anidbId}`);
        return null;
    }
}

/**
 * Get redirect URL from one platform to another
 * @param fromPlatform - Source platform (e.g., "anilist")
 * @param mediaId - Media ID on source platform
 * @param toPlatform - Target platform (e.g., "myanimelist")
 * @returns URL to the target platform or null
 */
export async function getRedirectUrl(
    fromPlatform: string,
    mediaId: number | string,
    toPlatform: string
): Promise<string | null> {
    try {
        const url = `${ANIME_API_URL}/redirect?platform=${fromPlatform}&mediaid=${mediaId}&target=${toPlatform}&israw=true`;

        const response = await fetchWithTimeout(url, {
            timeoutMs: 8000,
            headers: {
                "User-Agent": ANIME_API_USER_AGENT
            }
        });

        if (!response.ok) {
            return null;
        }

        return await response.text();
    } catch (error) {
        logger.error(error as Error, `AnimeApi redirect failed`);
        return null;
    }
}
