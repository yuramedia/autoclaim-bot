import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { fetchAnilistCoverByTitle } from "./anime-metadata";
import { fetchTsukihimeImagesByBtih } from "./tsukihime";
import { logger } from "../core/logger";
import { fetchWithTimeout } from "../utils/http";
import type { NekoBTTorrentResponse } from "../types";
import { NEKOBT_API_URL, NEKOBT_EMBED_COLOR, NEKOBT_TORRENT_REGEX } from "../constants";

/**
 * Normalizes a URL path to ensure it is a valid, absolute URL starting with https://.
 * @param urlStr - The URL string or relative path to normalize
 * @returns The normalized absolute URL string or null if empty
 */
export function normalizeNekoBTUrl(urlStr: string | null | undefined): string | null {
    if (!urlStr) return null;
    if (urlStr.startsWith("http://") || urlStr.startsWith("https://")) return urlStr;
    if (urlStr.startsWith("//")) return `https:${urlStr}`;
    if (urlStr.startsWith("/")) return `https://nekobt.to${urlStr}`;
    return `https://nekobt.to/${urlStr}`;
}

/**
 * Extracts NekoBT torrent ID from a given URL.
 * @param url - The NekoBT torrent URL
 * @returns The torrent ID string or null if not matched
 */
export function extractNekoBTId(url: string): string | null {
    const match = url.match(NEKOBT_TORRENT_REGEX);
    return match?.[2] ?? null;
}

/**
 * Fetches NekoBT torrent metadata from NekoBT API.
 * @param id - The NekoBT torrent ID
 * @returns NekoBTTorrentResponse or null if fetch fails
 */
export async function fetchNekoBTTorrent(id: string): Promise<NekoBTTorrentResponse | null> {
    try {
        const res = await fetchWithTimeout(`${NEKOBT_API_URL}/torrents/${id}`, {
            timeoutMs: 10000,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
                Accept: "application/json"
            }
        });
        if (!res.ok) {
            logger.error(`[NekoBT] Failed to fetch torrent ${id}: ${res.status}`);
            return null;
        }
        const data = (await res.json()) as NekoBTTorrentResponse;
        if (data.error) {
            logger.error(`[NekoBT] API returned error for ${id}: ${data.message ?? "Unknown error"}`);
            return null;
        }
        return data;
    } catch (error) {
        logger.error(error, `[NekoBT] Error fetching torrent ${id}`);
        return null;
    }
}

/**
 * Formats a number of bytes into a human-readable string.
 * @param bytes - The number of bytes
 * @param decimals - The number of decimal places to keep
 * @returns The formatted string (e.g. "12.34 MiB")
 */
export function formatBytes(bytes: number, decimals = 2): string {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

/**
 * Parses and normalizes NekoBT timestamp into milliseconds or Date.
 * @param uploadedAt - Timestamp in Unix seconds, milliseconds, or ISO string
 * @returns Normalized Date object or null if invalid
 */
export function parseNekoBTTimestamp(uploadedAt: number | string | undefined | null): Date | null {
    if (!uploadedAt) return null;
    if (typeof uploadedAt === "number") {
        const ms = uploadedAt < 1e11 ? uploadedAt * 1000 : uploadedAt;
        const date = new Date(ms);
        return isNaN(date.getTime()) ? null : date;
    }
    const num = Number(uploadedAt);
    if (!isNaN(num) && uploadedAt.trim() !== "") {
        const ms = num < 1e11 ? num * 1000 : num;
        const date = new Date(ms);
        return isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(uploadedAt);
    return isNaN(date.getTime()) ? null : date;
}

/**
 * Builds a rich Discord embed and components from a NekoBT torrent URL.
 * @param url - The NekoBT torrent URL
 * @returns Object containing embeds and components, or null if building fails
 */
export async function buildNekoBTEmbed(
    url: string
): Promise<{ embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } | null> {
    try {
        const id = extractNekoBTId(url);
        if (!id) return null;

        const torrentResponse = await fetchNekoBTTorrent(id);
        if (!torrentResponse || !torrentResponse.data) return null;

        const data = torrentResponse.data;

        // Determine uploader string and urls
        let uploaderName = data.uploader?.display_name || data.uploader?.username || "Anonymous";
        let authorUrl = data.uploader?.id ? `https://nekobt.to/users/${data.uploader.id}` : "https://nekobt.to";
        let authorIcon = data.uploader?.pfp_hash
            ? (normalizeNekoBTUrl(`/cdn/pfp/${data.uploader.pfp_hash}`) ??
              "https://avatars.githubusercontent.com/u/221218851?v=4")
            : "https://avatars.githubusercontent.com/u/221218851?v=4";

        if (data.groups && data.groups.length > 0) {
            const group = data.groups[0];
            if (group) {
                uploaderName = group.display_name ?? uploaderName;
                if (group.id) authorUrl = `https://nekobt.to/groups/${group.id}`;
                if (group.pfp_hash) {
                    const groupIcon = normalizeNekoBTUrl(`/cdn/pfp/${group.pfp_hash}`);
                    if (groupIcon) authorIcon = groupIcon;
                }
            }
        }

        const sizeInBytes = typeof data.filesize === "number" ? data.filesize : parseInt(String(data.filesize), 10);
        const humanSize = formatBytes(isNaN(sizeInBytes) ? 0 : sizeInBytes);

        const seedersStr = data.seeders != null ? String(data.seeders) : "0";
        const leechersStr = data.leechers != null ? String(data.leechers) : "0";

        const screenshots = (data.screenshots ?? [])
            .map(s => normalizeNekoBTUrl(s))
            .filter((s): s is string => s !== null);

        const embed = new EmbedBuilder()
            .setTitle((data.title ?? "NekoBT Torrent").substring(0, 256))
            .setURL(url)
            .setColor(NEKOBT_EMBED_COLOR)
            .setAuthor({
                name: uploaderName,
                iconURL: authorIcon,
                url: authorUrl
            })
            .addFields(
                { name: "Seeders", value: seedersStr, inline: true },
                { name: "Leechers", value: leechersStr, inline: true },
                { name: "File Size", value: humanSize, inline: true },
                { name: "Uploaded By", value: uploaderName, inline: true },
                { name: "ℹ️ Info Hash", value: `\`${data.infohash ?? "Unknown"}\``, inline: false }
            );

        const timestamp = parseNekoBTTimestamp(data.uploaded_at);
        if (timestamp) {
            embed.setTimestamp(timestamp);
        }

        // Fetch anime images: try Tsukihime first, then ameNZB fallback
        if (data.infohash && data.infohash !== "Unknown" && data.animetosho !== "skipped") {
            // Try Tsukihime first by btih
            const tsukiImages = await fetchTsukihimeImagesByBtih(data.infohash);

            if (tsukiImages?.cover) {
                // Tsukihime cover
                embed.setThumbnail(tsukiImages.cover);
                if (tsukiImages.screenshots.length > 0) {
                    embed.setImage(tsukiImages.screenshots[0] || null);
                } else if (screenshots.length > 0) {
                    embed.setImage(screenshots[0] || null);
                }
            } else {
                // Tsukihime miss — fall back to AniList cover & NekoBT screenshots
                const fallbackCover = await fetchAnilistCoverByTitle(data.title);
                if (fallbackCover) {
                    embed.setThumbnail(fallbackCover);
                } else if (screenshots.length > 0) {
                    embed.setThumbnail(screenshots[0] || null);
                }

                if (screenshots.length > 0) {
                    embed.setImage(screenshots[0] || null);
                }
            }
        } else {
            // No infohash or skipped — try Anilist cover fallback
            const fallbackCover = await fetchAnilistCoverByTitle(data.title);
            if (fallbackCover) {
                embed.setThumbnail(fallbackCover);
            } else if (screenshots.length > 0) {
                embed.setThumbnail(screenshots[0] || null);
            }
        }

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setLabel("View on NekoBT").setURL(url).setStyle(ButtonStyle.Link)
        );

        return { embeds: [embed], components: [row] };
    } catch (error) {
        logger.error(error, `[NekoBT] Error building embed for ${url}`);
        return null;
    }
}
