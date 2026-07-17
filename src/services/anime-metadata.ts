/**
 * Anime Metadata Service
 * Fetches anime relations from animeApi.my.id
 * Reference: https://github.com/nattadasu/animeApi
 */

import { logger } from "../core/logger";
import type { AnimeApiResponse, AnimeMetadata } from "../types";
import { ANIME_API_URL, ANIME_API_USER_AGENT } from "../constants";

/**
 * Search for anime by title using animeApi.my.id
 * Uses the redirect service to find mappings
 * @param title - Anime title to search for
 * @returns Anime metadata including MAL and Anilist IDs
 */
export async function searchAnime(title: string): Promise<AnimeMetadata | null> {
    try {
        // First, try to search using the Anilist platform
        // animeApi doesn't have direct search, so we use the redirect service
        const searchUrl = `${ANIME_API_URL}/anilist?search=${encodeURIComponent(title)}`;

        const response = await fetch(searchUrl, {
            headers: {
                "User-Agent": ANIME_API_USER_AGENT,
                Accept: "application/json"
            }
        });

        if (!response.ok) {
            logger.error(`AnimeApi search failed: ${response.status}`);
            return null;
        }

        // Try to get the redirected URL which contains the Anilist ID
        const finalUrl = response.url;
        const anilistMatch = finalUrl.match(/anilist\/(\d+)/);

        if (!anilistMatch) {
            // Fallback to search URLs
            return {
                title,
                anilistUrl: `https://anilist.co/search/anime?search=${encodeURIComponent(title)}`,
                malUrl: `https://myanimelist.net/anime.php?q=${encodeURIComponent(title)}`
            };
        }

        const anilistId = parseInt(anilistMatch[1]!, 10);

        // Now fetch the full anime data using the Anilist ID
        const animeData = await fetchAnimeByAnilistId(anilistId);

        if (!animeData) {
            return {
                title,
                anilistId,
                anilistUrl: `https://anilist.co/anime/${anilistId}`
            };
        }

        return {
            title: animeData.title || title,
            malId: animeData.myanimelist ?? undefined,
            anilistId: animeData.anilist ?? undefined,
            anilistUrl: animeData.anilist ? `https://anilist.co/anime/${animeData.anilist}` : undefined,
            malUrl: animeData.myanimelist ? `https://myanimelist.net/anime/${animeData.myanimelist}` : undefined
        };
    } catch (error) {
        logger.error(error as Error, `AnimeApi search failed for "${title}"`);
        return null;
    }
}

/**
 * Fetch anime data by Anilist ID
 * @param anilistId - Anilist ID
 * @returns Anime API response or null
 */
export async function fetchAnimeByAnilistId(anilistId: number): Promise<AnimeApiResponse | null> {
    try {
        const url = `${ANIME_API_URL}/anilist/${anilistId}`;

        const response = await fetch(url, {
            headers: {
                "User-Agent": ANIME_API_USER_AGENT,
                Accept: "application/json"
            }
        });

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
        const url = `${ANIME_API_URL}/myanimelist/${malId}`;

        const response = await fetch(url, {
            headers: {
                "User-Agent": ANIME_API_USER_AGENT,
                Accept: "application/json"
            }
        });

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

        const response = await fetch(url, {
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
