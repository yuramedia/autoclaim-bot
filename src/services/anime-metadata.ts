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

/**
 * Fetches an Anilist cover image by searching with an anime title.
 * Cleans torrent-style titles before searching.
 * @param title - The anime title (may contain torrent-style formatting)
 * @returns Cover image URL, or null if not found
 */
export async function fetchAnilistCoverByTitle(title: string): Promise<string | null> {
    let cleanTitle = title
        // Remove file extensions
        .replace(/\.(mkv|mp4|avi|srt|ass)$/i, "")
        // Remove content in brackets and parentheses
        .replace(/\[.*?\]/g, "")
        .replace(/\(.*?\)/g, "");

    // Split by pipe and take the first non-empty part
    if (cleanTitle.includes("|")) {
        const parts = cleanTitle
            .split("|")
            .map(p => p.trim())
            .filter(p => p.length > 0);
        const firstPart = parts[0];
        if (firstPart) {
            cleanTitle = firstPart;
        }
    }

    // Common torrent words that might not be in brackets
    const removeWords = [
        "1080p",
        "720p",
        "480p",
        "4k",
        "x265",
        "x264",
        "HEVC",
        "10bit",
        "8bit",
        "60fps",
        "AAC",
        "FLAC",
        "Opus",
        "WEBRip",
        "WEB-DL",
        "BluRay",
        "BDRip",
        "PROPER",
        "REPACK",
        "Dual-Audio",
        "Multi-Subs",
        "Subs",
        "RAW",
        "HD",
        "FHD",
        "Opus2",
        "0",
        "v1",
        "v2",
        "v3",
        "v4",
        "HEADPATTER",
        "Erai-raws",
        "SubsPlease"
    ];

    const exactWordRegex = new RegExp(`\\b(${removeWords.join("|")})\\b`, "gi");
    cleanTitle = cleanTitle.replace(exactWordRegex, "");

    // Remove standalone episode numbers at the end like "- 01" or "- 12"
    cleanTitle = cleanTitle.replace(/-\s*\d+(\.\d+)?\s*$/, "");
    cleanTitle = cleanTitle.replace(/\bS\d{1,2}E\d{1,3}\b/gi, ""); // Remove S01E02
    cleanTitle = cleanTitle.replace(/\bS\d{1,2}\b/gi, ""); // Remove Season numbers like S01, S2
    cleanTitle = cleanTitle.replace(/\bE\d{1,3}\b/gi, ""); // Remove E02
    cleanTitle = cleanTitle.replace(/\b(Episode|Ep)\s*\d+\b/gi, ""); // Remove 'Episode 12'

    // Replace dots, underscores with spaces
    cleanTitle = cleanTitle.replace(/[-_.]/g, " ");

    cleanTitle = cleanTitle.replace(/\s+/g, " ").trim();
    try {
        const metadata = await searchAnime(cleanTitle);
        if (metadata?.anilistId) {
            return `https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/b${metadata.anilistId}.jpg`;
        }
        return null;
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`[Anime Cover] Error fetching cover for title ${cleanTitle}: ${errorMessage}`);
        return null;
    }
}

/**
 * Fetches an Anilist cover image using an AniDB anime ID.
 * Maps the AniDB ID to Anilist ID via animeapi.my.id, then queries the Anilist GraphQL API.
 * @param anidbId - The AniDB anime ID
 * @returns Cover image URL, or null if not found
 */
export async function fetchAnilistCover(anidbId: number | string): Promise<string | null> {
    try {
        const animeData = await fetchAnimeByAnidbId(anidbId);
        if (animeData?.anilist) {
            return `https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/b${animeData.anilist}.jpg`;
        }
        return null;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[Anime Cover] Error fetching cover for AniDB ${anidbId}: ${msg}`);
        return null;
    }
}
