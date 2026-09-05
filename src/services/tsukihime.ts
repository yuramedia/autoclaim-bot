/**
 * Tsukihime API Service
 * Fetches anime torrent metadata from the Tsukihime indexer API (api.tsukihime.org/v1).
 * Used as a primary alternative to ameNZB for enriching Nyaa and NekoBT embeds
 * with anime cover images, genres, studios, and group info.
 */

import axios from "axios";
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { logger } from "../core/logger";
import { BROWSER_USER_AGENT, TSUKIHIME_API_BASE_URL, TSUKIHIME_EMBED_COLOR } from "../constants";
import type { TsukihimeImages, TsukihimeTorrent } from "../types";
import { fetchAnilistCoverByTitle } from "./anime-metadata";
import { formatBytes } from "./nekobt";

/**
 * Common headers for Tsukihime API requests
 */
const TSUKIHIME_HEADERS = {
    "User-Agent": BROWSER_USER_AGENT,
    Accept: "application/json"
};

/**
 * Cache for Tsukihime torrent lookups: cacheKey -> { data, expiry }
 */
const tsukihimeCache = new Map<string, { data: TsukihimeImages; expiry: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Parses and normalizes a Tsukihime date field into a Date object.
 * @param dateVal - Unix timestamp in seconds, milliseconds, or ISO date string
 * @returns Date object or null if invalid
 */
export function parseTsukihimeTimestamp(dateVal: number | string | undefined | null): Date | null {
    if (!dateVal) return null;
    if (typeof dateVal === "number") {
        const ms = dateVal < 1e11 ? dateVal * 1000 : dateVal;
        const date = new Date(ms);
        return isNaN(date.getTime()) ? null : date;
    }
    const num = Number(dateVal);
    if (!isNaN(num) && dateVal.trim() !== "") {
        const ms = num < 1e11 ? num * 1000 : num;
        const date = new Date(ms);
        return isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(dateVal);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Fetches a torrent from Tsukihime by Nyaa.si torrent ID.
 * @param nyaaId - The numeric Nyaa.si torrent ID
 * @returns TsukihimeTorrent or null if not found
 */
export async function fetchTsukihimeTorrentByNyaa(nyaaId: number): Promise<TsukihimeTorrent | null> {
    try {
        return await fetchTsukihimeTorrent(`/torrents/nyaa/${nyaaId}`, `nyaa:${nyaaId}`);
    } catch (error) {
        logger.error(error, `[Tsukihime] Error in fetchTsukihimeTorrentByNyaa for ${nyaaId}`);
        return null;
    }
}

/**
 * Fetches a torrent from Tsukihime by Sukebei torrent ID.
 * @param sukebeiId - The numeric Sukebei torrent ID
 * @returns TsukihimeTorrent or null if not found
 */
export async function fetchTsukihimeTorrentBySukebei(sukebeiId: number): Promise<TsukihimeTorrent | null> {
    try {
        return await fetchTsukihimeTorrent(`/torrents/sukebei/${sukebeiId}`, `sukebei:${sukebeiId}`);
    } catch (error) {
        logger.error(error, `[Tsukihime] Error in fetchTsukihimeTorrentBySukebei for ${sukebeiId}`);
        return null;
    }
}

/**
 * Fetches a torrent from Tsukihime by BitTorrent info hash.
 * @param btih - The lowercase hex info hash
 * @returns TsukihimeTorrent or null if not found
 */
export async function fetchTsukihimeTorrentByBtih(btih: string): Promise<TsukihimeTorrent | null> {
    try {
        return await fetchTsukihimeTorrent(`/torrents/btih/${btih.toLowerCase()}`, `btih:${btih.toLowerCase()}`);
    } catch (error) {
        logger.error(error, `[Tsukihime] Error in fetchTsukihimeTorrentByBtih for ${btih}`);
        return null;
    }
}

/**
 * Internal helper to fetch a torrent from any Tsukihime endpoint.
 * @param path - API path (e.g. "/torrents/nyaa/12345")
 * @param cacheKey - Unique cache key for this lookup
 * @returns TsukihimeTorrent or null on failure/404
 */
async function fetchTsukihimeTorrent(path: string, cacheKey: string): Promise<TsukihimeTorrent | null> {
    try {
        const url = `${TSUKIHIME_API_BASE_URL}${path}`;
        const response = await axios.get<TsukihimeTorrent>(url, {
            timeout: 10000,
            headers: TSUKIHIME_HEADERS
        });

        if (response.data && response.data.id) {
            return response.data;
        }
        return null;
    } catch (error: unknown) {
        // 404 is expected for torrents not indexed by Tsukihime
        if (axios.isAxiosError(error) && error.response?.status === 404) {
            return null;
        }
        logger.error(error, `[Tsukihime] Error fetching ${cacheKey}`);
        return null;
    }
}

/**
 * Extracts anime images and metadata from a Tsukihime torrent response.
 * @param torrent - Full Tsukihime torrent object
 * @returns Extracted images and metadata
 */
export function extractTsukihimeImages(torrent: TsukihimeTorrent): TsukihimeImages {
    const result: TsukihimeImages = {
        cover: null,
        animeTitle: null,
        genres: [],
        studios: [],
        groupName: null,
        screenshots: []
    };

    if (torrent.anime) {
        result.cover = torrent.anime.thumbnail || null;
        result.animeTitle = torrent.anime.english_title || torrent.anime.title || null;
        result.genres = torrent.anime.genres || [];
        result.studios = torrent.anime.studios || [];
    }

    if (torrent.group) {
        result.groupName = torrent.group.name || null;
    }

    // Extract screenshots
    if (torrent.files && torrent.files.length > 0) {
        const file = torrent.files[0];
        if (file && file.id != null && file.vidframes && file.vidframes.length > 0) {
            const numericId = typeof file.id === "number" ? file.id : parseInt(String(file.id), 10);
            if (!isNaN(numericId)) {
                const hexId = numericId.toString(16).toLowerCase().padStart(8, "0");
                result.screenshots = file.vidframes.map(
                    frame => `https://storage.tsukihime.org/sframes/${hexId}_${frame}.webp`
                );
            }
        }
    }

    return result;
}

/**
 * Fetches anime images from Tsukihime by Nyaa ID, with caching.
 * @param nyaaId - Nyaa.si torrent ID
 * @returns TsukihimeImages or null if torrent not found in Tsukihime
 */
export async function fetchTsukihimeImagesByNyaa(nyaaId: number): Promise<TsukihimeImages | null> {
    try {
        const cacheKey = `nyaa:${nyaaId}`;
        return await fetchTsukihimeImagesWithCache(cacheKey, () => fetchTsukihimeTorrentByNyaa(nyaaId));
    } catch (error) {
        logger.error(error, `[Tsukihime] Error in fetchTsukihimeImagesByNyaa for ${nyaaId}`);
        return null;
    }
}

/**
 * Fetches anime images from Tsukihime by Sukebei ID, with caching.
 * @param sukebeiId - Sukebei torrent ID
 * @returns TsukihimeImages or null if torrent not found in Tsukihime
 */
export async function fetchTsukihimeImagesBySukebei(sukebeiId: number): Promise<TsukihimeImages | null> {
    try {
        const cacheKey = `sukebei:${sukebeiId}`;
        return await fetchTsukihimeImagesWithCache(cacheKey, () => fetchTsukihimeTorrentBySukebei(sukebeiId));
    } catch (error) {
        logger.error(error, `[Tsukihime] Error in fetchTsukihimeImagesBySukebei for ${sukebeiId}`);
        return null;
    }
}

/**
 * Fetches anime images from Tsukihime by info hash, with caching.
 * @param btih - BitTorrent info hash
 * @returns TsukihimeImages or null if torrent not found in Tsukihime
 */
export async function fetchTsukihimeImagesByBtih(btih: string): Promise<TsukihimeImages | null> {
    try {
        const cacheKey = `btih:${btih.toLowerCase()}`;
        return await fetchTsukihimeImagesWithCache(cacheKey, () => fetchTsukihimeTorrentByBtih(btih));
    } catch (error) {
        logger.error(error, `[Tsukihime] Error in fetchTsukihimeImagesByBtih for ${btih}`);
        return null;
    }
}

/**
 * Internal helper for cached Tsukihime image fetching.
 * @param cacheKey - Unique cache key
 * @param fetcher - Function that fetches the torrent
 * @returns TsukihimeImages or null
 */
async function fetchTsukihimeImagesWithCache(
    cacheKey: string,
    fetcher: () => Promise<TsukihimeTorrent | null>
): Promise<TsukihimeImages | null> {
    try {
        // Check cache
        const cached = tsukihimeCache.get(cacheKey);
        if (cached && Date.now() < cached.expiry) {
            return cached.data;
        }

        const torrent = await fetcher();
        if (!torrent) {
            return null;
        }

        const images = extractTsukihimeImages(torrent);

        // Cache if we got useful data
        if (images.cover || images.animeTitle) {
            tsukihimeCache.set(cacheKey, {
                data: images,
                expiry: Date.now() + CACHE_TTL
            });

            // Prune cache if too large
            if (tsukihimeCache.size > 500) {
                const firstKey = tsukihimeCache.keys().next().value;
                if (firstKey) tsukihimeCache.delete(firstKey);
            }
        }

        return images;
    } catch (error) {
        logger.error(error, `[Tsukihime] Error in fetchTsukihimeImagesWithCache for ${cacheKey}`);
        return null;
    }
}

/**
 * Fetches a torrent from Tsukihime by its internal Tsukihime torrent ID.
 * @param torrentId - The numeric Tsukihime torrent ID
 * @returns TsukihimeTorrent or null if not found
 */
export async function fetchTsukihimeTorrentById(torrentId: number): Promise<TsukihimeTorrent | null> {
    try {
        return await fetchTsukihimeTorrent(`/torrents/${torrentId}`, `tsukihime:${torrentId}`);
    } catch (error) {
        logger.error(error, `[Tsukihime] Error in fetchTsukihimeTorrentById for ${torrentId}`);
        return null;
    }
}

/**
 * Builds rich Discord embed and components from a Tsukihime torrent ID
 * @param torrentId - Tsukihime torrent ID
 * @param originalUrl - Original tsukihime.org URL
 * @returns Object with embeds and components or null
 */
export async function buildTsukihimeEmbed(
    torrentId: number,
    originalUrl: string
): Promise<{
    embeds: EmbedBuilder[];
    components: ActionRowBuilder<ButtonBuilder>[];
    files: AttachmentBuilder[];
} | null> {
    const torrent = await fetchTsukihimeTorrentById(torrentId);
    if (!torrent) return null;

    const torrentTitle = (torrent.name ?? "Tsukihime Torrent").substring(0, 256);
    const groupName = torrent.group?.name || "Anonymous";
    let authorUrl = "https://tsukihime.org";
    if (torrent.group?.id) {
        authorUrl = `https://tsukihime.org/groups/${torrent.group.id}`;
    }

    const embed = new EmbedBuilder()
        .setTitle(torrentTitle)
        .setURL(originalUrl)
        .setColor(TSUKIHIME_EMBED_COLOR)
        .setAuthor({
            name: groupName,
            url: authorUrl
        });

    let coverImage: string | null = torrent.anime?.thumbnail || null;
    if (!coverImage) {
        coverImage = await fetchAnilistCoverByTitle(torrent.name);
    }

    // Add fields
    const fields = [];

    if (torrent.anime) {
        const engTitle = torrent.anime.english_title;
        const nativeTitle = torrent.anime.title;
        const displayTitle = engTitle && engTitle !== nativeTitle ? `${engTitle} (${nativeTitle})` : nativeTitle;
        fields.push({ name: "Anime", value: displayTitle, inline: false });
    }

    if (torrent.episode_no !== null && torrent.episode_no !== undefined) {
        fields.push({ name: "Episode", value: torrent.episode_no.toString(), inline: true });
    }

    const sizeInBytes =
        typeof torrent.totalsize === "number" ? torrent.totalsize : parseInt(String(torrent.totalsize), 10);
    const humanSize = formatBytes(isNaN(sizeInBytes) ? 0 : sizeInBytes);

    fields.push({ name: "File Size", value: humanSize, inline: true });
    fields.push({ name: "NZB", value: torrent.has_nzb === 1 ? "Yes" : "No", inline: true });

    if (torrent.anime?.studios && torrent.anime.studios.length > 0) {
        fields.push({ name: "Studios", value: torrent.anime.studios.join(", "), inline: true });
    }

    // Calculate aggregated tracker stats safely
    let seeders = 0;
    let leechers = 0;
    let completed = 0;
    if (torrent.trackers && torrent.trackers.length > 0) {
        seeders = Math.max(0, ...torrent.trackers.map(t => Number(t.seeders) || 0));
        leechers = Math.max(0, ...torrent.trackers.map(t => Number(t.leechers) || 0));
        completed = Math.max(0, ...torrent.trackers.map(t => Number(t.complete) || 0));
    }
    fields.push({ name: "Swarm", value: `⬆️ ${seeders} / ⬇️ ${leechers} / ✅ ${completed}`, inline: true });

    if (torrent.anime?.genres && torrent.anime.genres.length > 0) {
        fields.push({ name: "Genres", value: torrent.anime.genres.join(", "), inline: false });
    }

    if (torrent.btih) {
        fields.push({ name: "ℹ️ Info Hash", value: `\`${torrent.btih}\``, inline: false });
    }

    // Database links
    if (torrent.anime) {
        const dbLinks: string[] = [];
        if (torrent.anime.anilist) {
            dbLinks.push(`[AniList](https://anilist.co/anime/${torrent.anime.anilist})`);
        }
        if (torrent.anime.mal) {
            dbLinks.push(`[MyAnimeList](https://myanimelist.net/anime/${torrent.anime.mal})`);
        }
        if (torrent.anime.anidb) {
            dbLinks.push(`[AniDB](https://anidb.net/anime/${torrent.anime.anidb})`);
        }
        if (dbLinks.length > 0) {
            fields.push({ name: "Anime Databases", value: dbLinks.join(" | "), inline: false });
        }
    }

    embed.addFields(fields);

    const timestamp = parseTsukihimeTimestamp(torrent.added_date);
    if (timestamp) {
        embed.setTimestamp(timestamp);
    }

    // Resolve main image (large image) and small thumbnail
    const tsukiImages = extractTsukihimeImages(torrent);
    let mainImage: string | null = null;
    let finalThumbnail: string | null = null;

    if (tsukiImages.screenshots.length > 0) {
        mainImage = tsukiImages.screenshots[0] || null;
        finalThumbnail = coverImage;
    }

    // Fallback: if no main image was found, use the cover image as the large main image
    if (!mainImage && coverImage) {
        mainImage = coverImage;
        finalThumbnail = null;
    }

    const files: AttachmentBuilder[] = [];

    if (mainImage) {
        if (mainImage.includes("tsukihime.org")) {
            try {
                const response = await axios.get(mainImage, {
                    headers: { "User-Agent": BROWSER_USER_AGENT },
                    responseType: "arraybuffer",
                    timeout: 8000
                });
                if (response.status === 200 && response.data) {
                    const buffer = Buffer.from(response.data as ArrayBuffer);
                    const attachment = new AttachmentBuilder(buffer, { name: "screenshot.webp" });
                    files.push(attachment);
                    embed.setImage("attachment://screenshot.webp");
                } else {
                    embed.setImage(mainImage);
                }
            } catch (error) {
                logger.error(error, "[Tsukihime] Failed to download screenshot");
                embed.setImage(mainImage);
            }
        } else {
            embed.setImage(mainImage);
        }
    }

    if (finalThumbnail) {
        embed.setThumbnail(finalThumbnail);
    }

    // Buttons
    const row = new ActionRowBuilder<ButtonBuilder>();
    let hasButtons = false;

    if (torrent.files && torrent.files.length > 0 && torrent.files[0]?.links) {
        const fileLinks = torrent.files[0].links;
        const entries = Object.entries(fileLinks).slice(0, 5);
        for (const [provider, downloadUrl] of entries) {
            if (downloadUrl && (downloadUrl.startsWith("http://") || downloadUrl.startsWith("https://"))) {
                row.addComponents(
                    new ButtonBuilder().setLabel(provider).setURL(downloadUrl).setStyle(ButtonStyle.Link)
                );
                hasButtons = true;
            }
        }
    }

    // Fallback if no files or no direct download links
    if (!hasButtons) {
        row.addComponents(
            new ButtonBuilder().setLabel("View on Tsukihime").setURL(originalUrl).setStyle(ButtonStyle.Link)
        );
        if (torrent.has_nzb === 1) {
            row.addComponents(
                new ButtonBuilder()
                    .setLabel("Download NZB")
                    .setURL(`${TSUKIHIME_API_BASE_URL}/torrents/${torrent.id}/nzb`)
                    .setStyle(ButtonStyle.Link)
            );
        }
    }

    return { embeds: [embed], components: [row], files };
}
