import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { fetchAnilistCoverByTitle, fetchAnimeImages } from "./animetosho";

export interface NekoBTTorrentResponse {
    error: boolean;
    message?: string;
    data: {
        id: string;
        uploaded_at: number; // Unix milliseconds
        title: string;
        auto_title: string;
        description: string | null;
        filesize: string;
        magnet: string;
        infohash: string;
        seeders: string;
        leechers: string;
        completed: string;
        screenshots: string[];
        uploader: {
            id: string;
            username: string;
            display_name: string;
            pfp_hash: string | null;
        } | null;
        groups: Array<{
            id: string;
            display_name: string;
            pfp_hash: string | null;
        }>;
        animetosho: any[] | string;
        animetosho_fetch_time: string | null;
    };
}

import { NEKOBT_API_URL, NEKOBT_EMBED_COLOR, NEKOBT_TORRENT_REGEX } from "../constants";

export function extractNekoBTId(url: string): string | null {
    const match = url.match(NEKOBT_TORRENT_REGEX);
    return match?.[2] ?? null;
}

export async function fetchNekoBTTorrent(id: string): Promise<NekoBTTorrentResponse | null> {
    try {
        const res = await fetch(`${NEKOBT_API_URL}/torrents/${id}`, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
                Accept: "application/json"
            }
        });
        if (!res.ok) {
            console.error(`[NekoBT] Failed to fetch torrent ${id}: ${res.status}`);
            return null;
        }
        const data = (await res.json()) as NekoBTTorrentResponse;
        if (data.error) {
            console.error(`[NekoBT] API returned error for ${id}:`, data.message);
            return null;
        }
        return data;
    } catch (error) {
        console.error(`[NekoBT] Error fetching torrent ${id}:`, error);
        return null;
    }
}

export function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KiB", "MiB", "GiB", "TiB", "PiB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export async function buildNekoBTEmbed(url: string) {
    const id = extractNekoBTId(url);
    if (!id) return null;

    const torrentResponse = await fetchNekoBTTorrent(id);
    if (!torrentResponse || !torrentResponse.data) return null;

    const data = torrentResponse.data;

    // Determine uploader string and urls
    let uploaderName = data.uploader?.display_name || data.uploader?.username || "Anonymous";
    let authorUrl = data.uploader?.id ? `https://nekobt.to/users/${data.uploader.id}` : "https://nekobt.to";
    let authorIcon = data.uploader?.pfp_hash
        ? `https://nekobt.to/cdn/pfp/${data.uploader.pfp_hash}`
        : "https://avatars.githubusercontent.com/u/221218851?v=4";

    if (data.groups && data.groups.length > 0) {
        const group = data.groups[0];
        if (group) {
            uploaderName = group.display_name ?? uploaderName;
            if (group.id) authorUrl = `https://nekobt.to/groups/${group.id}`;
            if (group.pfp_hash) authorIcon = `https://nekobt.to/cdn/pfp/${group.pfp_hash}`;
        }
    }

    const humanSize = formatBytes(parseInt(data.filesize, 10));

    const embed = new EmbedBuilder()
        .setTitle(data.title.substring(0, 256))
        .setURL(url)
        .setColor(NEKOBT_EMBED_COLOR) // NekoBT pinkish color
        .setAuthor({
            name: uploaderName,
            iconURL: authorIcon,
            url: authorUrl
        })
        .addFields(
            { name: "Seeders", value: data.seeders || "0", inline: true },
            { name: "Leechers", value: data.leechers || "0", inline: true },
            { name: "File Size", value: humanSize, inline: true },
            { name: "Uploaded By", value: uploaderName, inline: true },
            { name: "ℹ️ Info Hash", value: `\`${data.infohash}\``, inline: false }
        )
        .setTimestamp(data.uploaded_at);

    // Fetch AnimeTosho images for thumbnail and cover
    if (data.infohash && data.infohash !== "Unknown" && data.animetosho !== "skipped") {
        const images = await fetchAnimeImages(data.infohash);

        if (images.cover) {
            embed.setThumbnail(images.cover);
        } else {
            const fallbackCover = await fetchAnilistCoverByTitle(data.title);
            if (fallbackCover) {
                embed.setThumbnail(fallbackCover);
            } else if (data.screenshots && data.screenshots.length > 0) {
                embed.setThumbnail(data.screenshots[0] || null);
            } else if (images.screenshots.length > 1) {
                embed.setThumbnail(images.screenshots[1] || null);
            }
        }

        if (images.screenshots.length > 0) {
            embed.setImage(images.screenshots[0] || null);
        } else if (data.screenshots && data.screenshots.length > 1) {
            embed.setImage(data.screenshots[1] || null);
        }

        if (images.directDownloads.length > 0) {
            const ddlLinks = images.directDownloads
                .slice(0, 5)
                .map(dl => `[${dl.name}](${dl.url})`)
                .join(" | ");

            embed.addFields({
                name: "⬇️ Downloads",
                value: `${ddlLinks}\n*[View on AnimeTosho](https://animetosho.org/view/${data.infohash})*`
            });
        }
    } else {
        const fallbackCover = await fetchAnilistCoverByTitle(data.title);
        if (fallbackCover) {
            embed.setThumbnail(fallbackCover);
        } else if (data.screenshots && data.screenshots.length > 0) {
            embed.setThumbnail(data.screenshots[0] || null);
        }
    }

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setLabel("View on NekoBT").setURL(url).setStyle(ButtonStyle.Link)
    );

    return { embeds: [embed], components: [row] };
}
