/**
 * Tsukihime API Service
 * Fetches anime torrent metadata from the Tsukihime indexer API (api.tsukihime.org/v1).
 * Used as a primary alternative to ameNZB for enriching Nyaa and NekoBT embeds
 * with anime cover images, genres, studios, and group info.
 */

import axios from "axios";
import { TSUKIHIME_API_BASE_URL, TSUKIHIME_EMBED_COLOR } from "../constants/tsukihime.js";
import { BROWSER_USER_AGENT } from "../constants/anime.js";
import type { TsukihimeTorrent, TsukihimeImages } from "../types/tsukihime.js";
import { formatBytes } from "./nekobt.js";
import { fetchAnimeImages } from "./amenzb.js";
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

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
 * Fetches a torrent from Tsukihime by Nyaa.si torrent ID.
 * @param nyaaId - The numeric Nyaa.si torrent ID
 * @returns TsukihimeTorrent or null if not found
 */
export async function fetchTsukihimeTorrentByNyaa(nyaaId: number): Promise<TsukihimeTorrent | null> {
    return fetchTsukihimeTorrent(`/torrents/nyaa/${nyaaId}`, `nyaa:${nyaaId}`);
}

/**
 * Fetches a torrent from Tsukihime by Sukebei torrent ID.
 * @param sukebeiId - The numeric Sukebei torrent ID
 * @returns TsukihimeTorrent or null if not found
 */
export async function fetchTsukihimeTorrentBySukebei(sukebeiId: number): Promise<TsukihimeTorrent | null> {
    return fetchTsukihimeTorrent(`/torrents/sukebei/${sukebeiId}`, `sukebei:${sukebeiId}`);
}

/**
 * Fetches a torrent from Tsukihime by BitTorrent info hash.
 * @param btih - The lowercase hex info hash
 * @returns TsukihimeTorrent or null if not found
 */
export async function fetchTsukihimeTorrentByBtih(btih: string): Promise<TsukihimeTorrent | null> {
    return fetchTsukihimeTorrent(`/torrents/btih/${btih.toLowerCase()}`, `btih:${btih.toLowerCase()}`);
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
    } catch (error: any) {
        // 404 is expected for torrents not indexed by Tsukihime
        if (error?.response?.status === 404) {
            return null;
        }
        console.error(`[Tsukihime] Error fetching ${cacheKey}:`, error?.response?.status || error.message);
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
        groupName: null
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

    return result;
}

/**
 * Fetches anime images from Tsukihime by Nyaa ID, with caching.
 * @param nyaaId - Nyaa.si torrent ID
 * @returns TsukihimeImages or null if torrent not found in Tsukihime
 */
export async function fetchTsukihimeImagesByNyaa(nyaaId: number): Promise<TsukihimeImages | null> {
    const cacheKey = `nyaa:${nyaaId}`;
    return fetchTsukihimeImagesWithCache(cacheKey, () => fetchTsukihimeTorrentByNyaa(nyaaId));
}

/**
 * Fetches anime images from Tsukihime by Sukebei ID, with caching.
 * @param sukebeiId - Sukebei torrent ID
 * @returns TsukihimeImages or null if torrent not found in Tsukihime
 */
export async function fetchTsukihimeImagesBySukebei(sukebeiId: number): Promise<TsukihimeImages | null> {
    const cacheKey = `sukebei:${sukebeiId}`;
    return fetchTsukihimeImagesWithCache(cacheKey, () => fetchTsukihimeTorrentBySukebei(sukebeiId));
}

/**
 * Fetches anime images from Tsukihime by info hash, with caching.
 * @param btih - BitTorrent info hash
 * @returns TsukihimeImages or null if torrent not found in Tsukihime
 */
export async function fetchTsukihimeImagesByBtih(btih: string): Promise<TsukihimeImages | null> {
    const cacheKey = `btih:${btih.toLowerCase()}`;
    return fetchTsukihimeImagesWithCache(cacheKey, () => fetchTsukihimeTorrentByBtih(btih));
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
}

/**
 * Fetches a torrent from Tsukihime by its internal Tsukihime torrent ID.
 * @param torrentId - The numeric Tsukihime torrent ID
 * @returns TsukihimeTorrent or null if not found
 */
export async function fetchTsukihimeTorrentById(torrentId: number): Promise<TsukihimeTorrent | null> {
    return fetchTsukihimeTorrent(`/torrents/${torrentId}`, `tsukihime:${torrentId}`);
}

/**
 * Builds rich Discord embed and components from a Tsukihime torrent ID
 * @param torrentId - Tsukihime torrent ID
 * @param originalUrl - Original tsukihime.org URL
 * @returns Object with embeds and components or null
 */
export async function buildTsukihimeEmbed(torrentId: number, originalUrl: string) {
    const torrent = await fetchTsukihimeTorrentById(torrentId);
    if (!torrent) return null;

    const groupName = torrent.group?.name || "Anonymous";
    let authorUrl = "https://tsukihime.org";
    if (torrent.group?.id) {
        authorUrl = `https://tsukihime.org/groups/${torrent.group.id}`;
    }

    const embed = new EmbedBuilder()
        .setTitle(torrent.name.substring(0, 256))
        .setURL(originalUrl)
        .setColor(TSUKIHIME_EMBED_COLOR)
        .setAuthor({
            name: groupName,
            url: authorUrl
        });

    if (torrent.anime) {
        if (torrent.anime.thumbnail) {
            embed.setThumbnail(torrent.anime.thumbnail);
        }
        if (torrent.anime.synopsis) {
            const cleanSynopsis = torrent.anime.synopsis.slice(0, 400);
            const displaySynopsis = torrent.anime.synopsis.length > 400 ? `${cleanSynopsis}...` : cleanSynopsis;
            embed.setDescription(displaySynopsis);
        }
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

    fields.push({ name: "File Size", value: formatBytes(torrent.totalsize), inline: true });
    fields.push({ name: "NZB", value: torrent.has_nzb === 1 ? "Yes" : "No", inline: true });

    if (torrent.anime?.studios && torrent.anime.studios.length > 0) {
        fields.push({ name: "Studios", value: torrent.anime.studios.join(", "), inline: true });
    }

    // Calculate aggregated tracker stats
    let seeders = 0;
    let leechers = 0;
    let completed = 0;
    if (torrent.trackers && torrent.trackers.length > 0) {
        seeders = Math.max(...torrent.trackers.map(t => t.seeders));
        leechers = Math.max(...torrent.trackers.map(t => t.leechers));
        completed = Math.max(...torrent.trackers.map(t => t.complete));
    }
    fields.push({ name: "Swarm", value: `⬆️ ${seeders} / ⬇️ ${leechers} / ✅ ${completed}`, inline: true });

    if (torrent.anime?.genres && torrent.anime.genres.length > 0) {
        fields.push({ name: "Genres", value: torrent.anime.genres.join(", "), inline: false });
    }

    if (torrent.btih) {
        fields.push({ name: "ℹ️ Info Hash", value: `\`${torrent.btih}\``, inline: false });
    }

    // Mirrors / Source Links
    const mirrorLinks: string[] = [];
    if (torrent.nyaa_id > 0) {
        mirrorLinks.push(`[Nyaa.si](https://nyaa.si/view/${torrent.nyaa_id})`);
    }
    if (torrent.sukebei_id > 0) {
        mirrorLinks.push(`[Sukebei](https://sukebei.nyaa.si/view/${torrent.sukebei_id})`);
    }
    if (torrent.nekobt_id > 0) {
        mirrorLinks.push(`[NekoBT](https://nekobt.to/torrents/${torrent.nekobt_id})`);
    }
    if (torrent.has_nzb === 1) {
        mirrorLinks.push(`[NZB Download](${TSUKIHIME_API_BASE_URL}/torrents/${torrent.id}/nzb)`);
    }
    if (mirrorLinks.length > 0) {
        fields.push({ name: "Mirrors / Sources", value: mirrorLinks.join(" | "), inline: false });
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
    embed.setTimestamp(torrent.added_date * 1000);

    // Try fetching screenshots via ameNZB infohash lookup
    if (torrent.btih) {
        const images = await fetchAnimeImages(torrent.btih);
        if (images.screenshots.length > 0) {
            embed.setImage(images.screenshots[0] || null);
        }
    }

    // Buttons
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
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

    return { embeds: [embed], components: [row] };
}
