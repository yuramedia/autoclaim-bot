/**
 * ameNZB Service
 * Fetches anime screenshots and cover images via ameNZB's Newznab-compatible Search API.
 * Replaces the now-defunct AnimeTosho service.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import {
    AMENZB_BASE_URL,
    AMENZB_API_PATH,
    AMENZB_API_KEY,
    AMENZB_SCREENSHOTS_PATH,
    AMENZB_COVERS_PATH
} from "../constants/amenzb.js";
import { ANILIST_API_URL, ANILIST_USER_AGENT } from "../constants/anime.js";
import type { AmeNZBImages } from "../types/amenzb.js";

/**
 * Fetches ameNZB screenshots and cover image for a given torrent infohash.
 * Searches ameNZB by info_hash, then scrapes the release page for screenshot URLs.
 * Falls back to Anilist cover images when ameNZB cover is unavailable.
 * @param infohash - The BT infohash of the torrent
 * @returns An object containing screenshot URLs and a cover URL (if found)
 */
export async function fetchAnimeImages(infohash: string): Promise<AmeNZBImages> {
    const result: AmeNZBImages = {
        screenshots: [],
        cover: null
    };

    if (!AMENZB_API_KEY) {
        console.warn("[ameNZB] No API key configured (AMENZB_API_KEY). Skipping ameNZB lookup.");
        return result;
    }

    try {
        // 1. Search ameNZB by info_hash using Newznab API
        const searchUrl = `${AMENZB_BASE_URL}${AMENZB_API_PATH}?t=search&apikey=${AMENZB_API_KEY}&info_hash=${infohash.toLowerCase()}`;
        const searchResponse = await axios.get(searchUrl, { timeout: 15000 });
        const xml = searchResponse.data as string;

        if (!xml || typeof xml !== "string") {
            return result;
        }

        // Check for API error
        const errorMatch = xml.match(/<error\s+code="(\d+)"\s+description="([^"]*)"\s*\/>/);
        if (errorMatch) {
            console.error(`[ameNZB] API error ${errorMatch[1]}: ${errorMatch[2]}`);
            return result;
        }

        // 2. Parse the first <item> from Newznab XML response
        const releaseId = extractReleaseId(xml);
        if (!releaseId) {
            return result;
        }

        // 3. Scrape the release page for screenshots and cover
        const releaseUrl = `${AMENZB_BASE_URL}/release/${releaseId}`;
        const releaseResponse = await axios.get(releaseUrl, { timeout: 15000 });
        const html = releaseResponse.data as string;

        if (html && typeof html === "string") {
            // Extract screenshots from the release page HTML
            result.screenshots = extractScreenshots(html, releaseId);

            // Extract cover from the release page (ameNZB static cover or Anilist link)
            result.cover = extractCover(html);
        }

        // 4. If no cover found from HTML, try Anilist by extracting title from XML
        if (!result.cover) {
            const title = extractTitleFromXml(xml);
            if (title) {
                result.cover = await fetchAnilistCoverByTitle(title);
            }
        }

        return result;
    } catch (error) {
        console.error(`[ameNZB] Error fetching images for ${infohash}:`, error);
        return result;
    }
}

/**
 * Extracts the release ID from the first <item> in Newznab XML.
 * The release ID is derived from the <guid> or <link> element URL (e.g. https://amenzb.moe/download/12345).
 * Also checks <newznab:attr name="guid" value="12345"/> for the numeric ID.
 * @param xml - Newznab XML response string
 * @returns The numeric release ID string, or null if not found
 */
function extractReleaseId(xml: string): string | null {
    // Try to get guid from <newznab:attr name="guid" value="..."/>
    const guidAttrMatch = xml.match(/<newznab:attr\s+name="guid"\s+value="(\d+)"\s*\/>/);
    if (guidAttrMatch?.[1]) {
        return guidAttrMatch[1];
    }

    // Fallback: extract ID from <guid> URL
    const guidMatch = xml.match(/<guid[^>]*>https?:\/\/[^/]+\/(?:download|release)\/(\d+)<\/guid>/);
    if (guidMatch?.[1]) {
        return guidMatch[1];
    }

    // Fallback: extract from <link>
    const linkMatch = xml.match(/<link>https?:\/\/[^/]+\/(?:download|release)\/(\d+)<\/link>/);
    if (linkMatch?.[1]) {
        return linkMatch[1];
    }

    return null;
}

/**
 * Extracts the title from the first <item><title> in Newznab XML.
 * @param xml - Newznab XML response string
 * @returns The release title, or null if not found
 */
function extractTitleFromXml(xml: string): string | null {
    const match = xml.match(/<item>[\s\S]*?<title>([^<]+)<\/title>/);
    return match?.[1] || null;
}

/**
 * Extracts screenshot URLs from the ameNZB release page HTML.
 * Screenshots are in a collapsible section with id="screenshotBody".
 * Image elements have class "ss-thumb" with data-src (thumbnail) and data-full (full-size) attributes.
 * URL pattern: /static/screenshots/{releaseId}/{index}.webp
 * @param html - Release page HTML
 * @param releaseId - Numeric release ID for fallback URL construction
 * @returns Array of screenshot URLs (full-size preferred)
 */
function extractScreenshots(html: string, releaseId: string): string[] {
    const screenshots: string[] = [];
    const $ = cheerio.load(html);

    // Method 1: Parse data-full attributes from ss-thumb images (preferred — full-size)
    $(".ss-thumb, img[data-full]").each((_, el) => {
        const fullSrc = $(el).attr("data-full");
        if (fullSrc) {
            const absoluteUrl = fullSrc.startsWith("/") ? `${AMENZB_BASE_URL}${fullSrc}` : fullSrc;
            screenshots.push(absoluteUrl);
        }
    });

    // Method 2: Parse data-src attributes (thumbnail fallback)
    if (screenshots.length === 0) {
        $(".ss-thumb, img[data-src]").each((_, el) => {
            const dataSrc = $(el).attr("data-src");
            if (dataSrc && dataSrc.includes("screenshots")) {
                const absoluteUrl = dataSrc.startsWith("/") ? `${AMENZB_BASE_URL}${dataSrc}` : dataSrc;
                screenshots.push(absoluteUrl);
            }
        });
    }

    // Method 3: Parse src attributes from images inside screenshotBody
    if (screenshots.length === 0) {
        $("#screenshotBody img").each((_, el) => {
            const src = $(el).attr("src");
            if (src && src.includes("screenshots")) {
                const absoluteUrl = src.startsWith("/") ? `${AMENZB_BASE_URL}${src}` : src;
                screenshots.push(absoluteUrl);
            }
        });
    }

    // Method 4: Regex fallback for screenshot URLs in raw HTML
    if (screenshots.length === 0) {
        const screenshotRegex = /(?:data-full|data-src|src)="([^"]*\/static\/screenshots\/[^"]+\.webp)"/g;
        let match;
        while ((match = screenshotRegex.exec(html)) !== null) {
            const url = match[1];
            if (url) {
                const absoluteUrl = url.startsWith("/") ? `${AMENZB_BASE_URL}${url}` : url;
                if (!screenshots.includes(absoluteUrl)) {
                    screenshots.push(absoluteUrl);
                }
            }
        }
    }

    // Method 5: Construct URLs from known pattern if screenshot count is in HTML
    if (screenshots.length === 0) {
        const countMatch = html.match(/SCREENSHOTS\s*\((\d+)\)/i);
        if (countMatch?.[1]) {
            const count = parseInt(countMatch[1], 10);
            for (let i = 1; i <= count; i++) {
                const idx = i.toString().padStart(2, "0");
                screenshots.push(`${AMENZB_BASE_URL}${AMENZB_SCREENSHOTS_PATH}/${releaseId}/${idx}.webp`);
            }
        }
    }

    return [...new Set(screenshots)];
}

/**
 * Extracts the cover image URL from the ameNZB release page HTML.
 * Cover URLs follow the pattern: /static/covers/{anime_id}.jpg
 * Falls back to Anilist CDN URLs if found in the page.
 * @param html - Release page HTML
 * @returns Cover image URL, or null if not found
 */
function extractCover(html: string): string | null {
    const $ = cheerio.load(html);

    // Look for ameNZB static cover image
    const coverImg = $(`img[src*="${AMENZB_COVERS_PATH}"]`).first();
    if (coverImg.length > 0) {
        const src = coverImg.attr("src");
        if (src) {
            return src.startsWith("/") ? `${AMENZB_BASE_URL}${src}` : src;
        }
    }

    // Look for Anilist cover fallback in the page
    const anilistImg = $('img[src*="anilist.co"], img[src*="anilistcdn"]').first();
    if (anilistImg.length > 0) {
        return anilistImg.attr("src") || null;
    }

    // Regex fallback: check for cover URL in raw HTML
    const coverRegex =
        /(?:src|data-src)="(https?:\/\/[^"]*(?:\/static\/covers\/[^"]+|anilist\.co[^"]+|anilistcdn[^"]+))"/;
    const match = html.match(coverRegex);
    if (match?.[1]) {
        return match[1];
    }

    return null;
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

    // Construct regex for these exact words (case insensitive constraint)
    const exactWordRegex = new RegExp(`\\b(${removeWords.join("|")})\\b`, "gi");
    cleanTitle = cleanTitle.replace(exactWordRegex, "");

    // Remove standalone episode numbers at the end like "- 01" or "- 12"
    cleanTitle = cleanTitle.replace(/-\s*\d+(\.\d+)?\s*$/, "");
    cleanTitle = cleanTitle.replace(/\bS\d{1,2}\b/gi, ""); // Remove Season numbers like S01, S2
    cleanTitle = cleanTitle.replace(/\b(Episode|Ep)\s*\d+\b/gi, ""); // Remove 'Episode 12'

    // Replace dots, underscores with spaces
    cleanTitle = cleanTitle.replace(/[-_.]/g, " ");

    cleanTitle = cleanTitle.replace(/\s+/g, " ").trim();

    try {
        const query = `
      query($search: String) {
        Media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          coverImage { extraLarge }
        }
      }
    `;

        const aniResponse = await axios.post(
            ANILIST_API_URL,
            {
                query,
                variables: { search: cleanTitle }
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "User-Agent": ANILIST_USER_AGENT
                }
            }
        );

        const target = aniResponse.data?.data?.Media;
        if (target) {
            return target.coverImage?.extraLarge || null;
        }
        return null;
    } catch (error: any) {
        console.error(
            `[Anilist Cover] Error fetching cover for title ${cleanTitle}:`,
            error?.response?.data || error.message
        );
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
        // Get Anilist ID from the mapping API
        const mapResponse = await axios.get(`https://animeapi.my.id/anidb/${anidbId}`);
        const anilistId = mapResponse.data?.anilist;

        if (!anilistId) return null;

        // Query Anilist GraphQL for the Cover Image
        const query = `
      query($id: Int) {
        Media(id: $id, type: ANIME) {
          coverImage { extraLarge }
        }
      }
    `;

        const aniResponse = await axios.post(
            ANILIST_API_URL,
            {
                query,
                variables: { id: parseInt(anilistId.toString()) }
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    "User-Agent": ANILIST_USER_AGENT
                }
            }
        );

        const coverUrl = aniResponse.data?.data?.Media?.coverImage?.extraLarge;
        return coverUrl || null;
    } catch (error) {
        console.error(`[Anilist Cover] Error fetching cover for AniDB ${anidbId}:`, error);
        return null;
    }
}
