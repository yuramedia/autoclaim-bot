/**
 * ameNZB Service
 * Fetches anime screenshots and cover images via ameNZB's Newznab-compatible Search API.
 * Replaces the now-defunct AnimeTosho service.
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { EmbedBuilder } from "discord.js";
import { logger } from "../core/logger";
import {
    AMENZB_BASE_URL,
    AMENZB_API_PATH,
    AMENZB_API_KEY,
    AMENZB_SCREENSHOTS_PATH,
    AMENZB_COVERS_PATH
} from "../constants/amenzb.js";
import { BROWSER_USER_AGENT } from "../constants/anime.js";
import { searchAnime, fetchAnimeByAnidbId } from "./anime-metadata.js";
import type { AmeNZBImages } from "../types/amenzb.js";

/**
 * Common headers for ameNZB requests
 */
const AMENZB_HEADERS = {
    "User-Agent": BROWSER_USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9"
};

/**
 * Result of a release search
 */
interface SearchResult {
    releaseId: string;
    html?: string;
    title?: string;
}

/**
 * Cache for anime images: infohash -> AmeNZBImages
 */
const imageCache = new Map<string, { data: AmeNZBImages; expiry: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * @deprecated AmeNZB service is deprecated. Use Tsukihime or AniList metadata services instead.
 * Fetches ameNZB screenshots and cover image for a given torrent infohash.
 * Searches ameNZB by info_hash, then scrapes the release page for screenshot URLs.
 * Falls back to Anilist cover images when ameNZB cover is unavailable.
 * @param infohash - The BT infohash of the torrent
 * @returns An object containing screenshot URLs and a cover URL (if found)
 */
export async function fetchAnimeImages(infohash: string): Promise<AmeNZBImages> {
    logger.warn(`[ameNZB] fetchAnimeImages is deprecated. Requested infohash: ${infohash}`);
    const hash = infohash.toLowerCase();

    // Check cache
    const cached = imageCache.get(hash);
    if (cached && Date.now() < cached.expiry) {
        return cached.data;
    }

    const result: AmeNZBImages = {
        screenshots: [],
        cover: null,
        nzbId: null
    };

    try {
        // 1. Find the release ID using the info_hash
        const searchResult = await findReleaseInfoByHash(hash);
        if (!searchResult) {
            return result;
        }
        const { releaseId, title: searchTitle } = searchResult;
        let { html } = searchResult;
        result.nzbId = releaseId;

        // 2. Scrape the release page for screenshots and cover (if HTML not already fetched)
        if (!html) {
            const releaseUrl = `${AMENZB_BASE_URL}/release/${releaseId}`;
            const releaseResponse = await axios.get(releaseUrl, {
                timeout: 15000,
                headers: AMENZB_HEADERS
            });
            html = releaseResponse.data as string;
        }

        if (html && typeof html === "string") {
            const $ = cheerio.load(html);

            // Extract screenshots from the release page HTML
            result.screenshots = extractScreenshots(html, releaseId);

            // Extract cover from the release page (ameNZB static cover or Anilist link)
            result.cover = extractCover(html);

            // 4. If no cover found from HTML, try Anilist by extracting title from page or search
            if (!result.cover) {
                const pageTitle = $("h5").first().text().trim() || $("h4").first().text().trim();
                const title = pageTitle || searchTitle;
                if (title) {
                    result.cover = await fetchAnilistCoverByTitle(title);
                }
            }
        }

        // Cache result if something was found
        if (result.nzbId || result.screenshots.length > 0 || result.cover) {
            imageCache.set(hash, {
                data: result,
                expiry: Date.now() + CACHE_TTL
            });

            // Prune cache if too large
            if (imageCache.size > 1000) {
                const firstKey = imageCache.keys().next().value;
                if (firstKey) imageCache.delete(firstKey);
            }
        }

        return result;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[ameNZB] Error fetching images for ${infohash}: ${msg}`);
        return result;
    }
}

/**
 * @deprecated AmeNZB service is deprecated.
 * Build rich Discord embed from an ameNZB release ID
 * @param releaseId - Numeric ameNZB release ID
 * @param url - Original URL
 * @returns Configured EmbedBuilder
 */
export async function buildAmeNZBEmbed(releaseId: string, url: string): Promise<EmbedBuilder | null> {
    logger.warn(`[ameNZB] buildAmeNZBEmbed is deprecated. Requested release ID: ${releaseId}`);
    try {
        const releaseUrl = `${AMENZB_BASE_URL}/release/${releaseId}`;
        const response = await axios.get(releaseUrl, {
            timeout: 15000,
            headers: AMENZB_HEADERS
        });
        const html = response.data as string;

        if (!html || typeof html !== "string") {
            return null;
        }

        const $ = cheerio.load(html);
        const title = $("h5").first().text().trim() || $("h4").first().text().trim() || "ameNZB Release";
        const screenshots = extractScreenshots(html, releaseId);
        const cover = extractCover(html);

        // Extract metadata
        const metadata: Record<string, string> = {};
        $(".row.g-2.mt-2 div.col-auto").each((_, el) => {
            const text = $(el).text().trim();
            if (text.includes(":")) {
                const [key, value] = text.split(":").map(s => s.trim());
                if (key && value) metadata[key] = value;
            }
        });

        const embed = new EmbedBuilder()
            .setColor(0x00a2ff)
            .setTitle(title.slice(0, 256))
            .setURL(url)
            .setAuthor({
                name: "ameNZB",
                iconURL: `${AMENZB_BASE_URL}/static/favicon.ico`,
                url: AMENZB_BASE_URL
            });

        if (cover) embed.setThumbnail(cover);
        if (screenshots.length > 0) embed.setImage(screenshots[0]!);

        // Add fields
        if (metadata["Episodes"]) embed.addFields({ name: "Episodes", value: metadata["Episodes"], inline: true });
        if (metadata["Studio"]) embed.addFields({ name: "Studio", value: metadata["Studio"], inline: true });
        if (metadata["Source"]) embed.addFields({ name: "Source", value: metadata["Source"], inline: true });

        // Add health status if found
        const healthMatch = html.match(/health_status\s*=\s*'([^']+)'/);
        if (healthMatch?.[1]) {
            const status = healthMatch[1].charAt(0).toUpperCase() + healthMatch[1].slice(1);
            embed.addFields({ name: "Health", value: status, inline: true });
        }

        return embed;
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[ameNZB] Error building embed for ${releaseId}: ${msg}`);
        return null;
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
 * Finds the ameNZB release ID and associated info for a given infohash
 */
async function findReleaseInfoByHash(infohash: string): Promise<SearchResult | null> {
    try {
        // Try API first if API key is available
        if (AMENZB_API_KEY) {
            try {
                const searchUrl = `${AMENZB_BASE_URL}${AMENZB_API_PATH}?t=search&apikey=${AMENZB_API_KEY}&info_hash=${infohash.toLowerCase()}`;
                const response = await axios.get(searchUrl, { timeout: 15000, headers: AMENZB_HEADERS });

                const xml = response.data as string;
                const releaseId = extractReleaseId(xml);
                if (releaseId) {
                    return {
                        releaseId,
                        title: extractTitleFromXml(xml) || undefined
                    };
                }
            } catch (error: unknown) {
                const msg = error instanceof Error ? error.message : String(error);
                logger.error(`[ameNZB API] Search failed: ${msg}`);
            }
        }

        // Fallback to scraping the browse page
        try {
            const response = await axios.get(`${AMENZB_BASE_URL}/browse?q=${infohash}`, {
                timeout: 15000,
                headers: AMENZB_HEADERS
            });

            // Check if axios followed a redirect to a release page
            const finalUrl = response.request?.res?.responseUrl || response.config?.url || "";
            const idMatch = finalUrl.match(/\/(release|download)\/(\d+)/);
            if (idMatch?.[2]) {
                return {
                    releaseId: idMatch[2],
                    html: response.data as string
                };
            }

            const $ = cheerio.load(response.data);
            const releaseLink = $("a[href^='/release/']").first();
            const releaseHref = releaseLink.attr("href");

            if (releaseHref) {
                return {
                    releaseId: releaseHref.split("/").pop() || "",
                    title: releaseLink.text().trim() || undefined
                };
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error(`[ameNZB Scrape] Search failed: ${msg}`);
        }

        return null;
    } catch (outerError: unknown) {
        const msg = outerError instanceof Error ? outerError.message : String(outerError);
        logger.error(`[ameNZB findReleaseInfoByHash] Outer failure: ${msg}`);
        return null;
    }
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
