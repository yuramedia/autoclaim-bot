/**
 * Nyaa.si Service
 * Fetches and parses torrent pages from nyaa.si, and builds rich embeds
 */

import axios from "axios";
import { EmbedBuilder } from "discord.js";
import type { NyaaTorrentInfo, NyaaComment, NyaaApiResponse } from "../types/nyaa";
import { PlatformId } from "../types/embed-fix";
import { PLATFORMS } from "../constants/embed-fix";
import { fetchAnimeImages, fetchAnilistCoverByTitle } from "./animetosho";

const NYAA_COLOR = PLATFORMS.find(p => p.id === PlatformId.NYAA)?.color ?? 0x0089ff;

/**
 * Extract image URLs from text (supports markdown syntax and direct URLs)
 * @param text - Text to search for image URLs
 * @returns Array of image URLs found
 */
function extractImageUrls(text: string): string[] {
    if (!text) return [];

    const imageUrls: string[] = [];

    // Match markdown image syntax: ![alt](url)
    const markdownRegex = /!\[.*?\]\((.*?)\)/g;
    let match;
    while ((match = markdownRegex.exec(text)) !== null) {
        if (match[1]) imageUrls.push(match[1]);
    }

    // Match direct image URLs (http/https URLs ending with image extensions)
    const directUrlRegex = /https?:\/\/[^\s)<>\]]+\.(jpg|jpeg|png|gif|webp|bmp)/gi;
    while ((match = directUrlRegex.exec(text)) !== null) {
        if (match[0] && !imageUrls.includes(match[0])) imageUrls.push(match[0]);
    }

    return imageUrls;
}

/**
 * Fetch and extract torrent information from a nyaa.si view page via NyaaAPI
 * @param viewId - The ID of the torrent page
 * @param provider - 'nyaa' or 'sukebei'
 * @returns Parsed torrent information or null if failed
 */
export async function fetchNyaaInfo(
    viewId: string,
    provider: "nyaa" | "sukebei" = "nyaa"
): Promise<NyaaTorrentInfo | null> {
    try {
        const url = `https://nyaaapi.onrender.com/${provider}/id/${viewId}`;
        const response = await axios.get<{ data: NyaaApiResponse }>(url, {
            timeout: 15000
        });

        const data = response.data.data;
        if (!data || !data.title) return null;

        return {
            title: data.title,
            category: data.category || "Unknown",
            uploader: data.uploader || "Anonymous",
            information: data.information || null,
            seeds: data.seeders || 0,
            leechers: data.leechers || 0,
            completed: data.downloads || 0,
            size: data.size || "Unknown",
            date: data.time || "Unknown",
            infoHash: data.infohash || "Unknown",
            magnetLink: data.magnet || "",
            torrentUrl: data.torrent
                ? `https://${provider === "sukebei" ? "sukebei." : ""}nyaa.si${data.torrent}`
                : null
        };
    } catch (error) {
        console.error(`Failed to fetch ${provider}.nyaa.si info for ${viewId}:`, error);
        return null;
    }
}

/**
 * Fetch a specific comment from a nyaa.si view page via NyaaAPI
 * @param viewId - The ID of the torrent page
 * @param commentId - The ID of the comment (from `#com-XX`)
 * @param provider - 'nyaa' or 'sukebei'
 * @returns Parsed comment information and torrent title, or null if failed
 */
export async function fetchNyaaComment(
    viewId: string,
    commentId: string,
    provider: "nyaa" | "sukebei" = "nyaa"
): Promise<{ comment: NyaaComment; torrentTitle: string; infoHash?: string } | null> {
    try {
        const url = `https://nyaaapi.onrender.com/${provider}/id/${viewId}`;
        const response = await axios.get<{ data: NyaaApiResponse }>(url, {
            timeout: 15000
        });

        const data = response.data.data;
        if (!data || !data.comments) return null;

        // The API returns links like "https://nyaa.si/view/1273100#com-24"
        const targetLinkSuffix = `#com-${commentId}`;
        const comment = data.comments.find(c => c.link.endsWith(targetLinkSuffix));

        if (!comment) return null;

        return {
            comment,
            torrentTitle: data.title,
            infoHash: data.infohash
        };
    } catch (error) {
        console.error(`Failed to fetch ${provider}.nyaa.si comment for ${viewId}#com-${commentId}:`, error);
        return null;
    }
}

/**
 * Build rich Discord embed from a Nyaa comment
 * @param comment - Parsed Nyaa comment
 * @param torrentTitle - Title of the torrent the comment belongs to
 * @param url - Original Nyaa.si comment URL
 * @returns Array of Configured EmbedBuilder (usually just one)
 */
export async function buildNyaaCommentEmbed(
    comment: NyaaComment,
    torrentTitle: string,
    url: string,
    provider: "nyaa" | "sukebei" = "nyaa",
    infoHash?: string
): Promise<EmbedBuilder[]> {
    const domain = provider === "sukebei" ? "sukebei.nyaa.si" : "nyaa.si";

    const embed = new EmbedBuilder()
        .setColor(NYAA_COLOR)
        .setURL(url)
        .setTitle(`Comment on: ${torrentTitle}`.slice(0, 256))
        .setAuthor({
            name: comment.user || "Unknown User",
            iconURL: comment.avatar || `https://${domain}/static/img/avatar/default.png`,
            url: comment.profileUrl || url
        });

    let description = comment.commentBody || "*Empty comment*";

    // Extract first image if any to use as embed image
    const imageMatch = description.match(/!\[.*?\]\((.*?)\)/);
    if (imageMatch && imageMatch[1]) {
        embed.setImage(imageMatch[1]);
        // Remove the first image from the description to avoid clutter, using simple replace
        description = description.replace(imageMatch[0], "").trim();
    }

    embed.setDescription(description.slice(0, 4096) || "*Empty comment*");

    // Try to parse the date as proper ISO timestamp if possible, else skip
    try {
        if (comment.time) {
            const parsedDate = new Date(comment.time.replace(" UTC", "Z"));
            if (!isNaN(parsedDate.getTime())) {
                embed.setTimestamp(parsedDate);
            }
        }
    } catch {}

    // Fetch AnimeTosho images if infoHash is provided
    if (infoHash && infoHash !== "Unknown") {
        const images = await fetchAnimeImages(infoHash);

        // Thumbnail: Anilist cover or secondary screenshot
        if (images.cover) {
            embed.setThumbnail(images.cover);
        } else {
            const fallbackCover = await fetchAnilistCoverByTitle(torrentTitle);
            if (fallbackCover) {
                embed.setThumbnail(fallbackCover);
            } else if (images.screenshots.length > 1) {
                embed.setThumbnail(images.screenshots[1] || null);
            }
        }

        // If the comment doesn't already have an image from markdown, apply primary screenshot
        if (!imageMatch || !imageMatch[1]) {
            if (images.screenshots.length > 0) {
                embed.setImage(images.screenshots[0] || null);
            }
        }
    } else {
        const fallbackCover = await fetchAnilistCoverByTitle(torrentTitle);
        if (fallbackCover) embed.setThumbnail(fallbackCover);
    }

    return [embed];
}

/**
 * Build rich Discord embed from Nyaa torrent information
 * @param info - Parsed Nyaa torrent info
 * @param url - Original Nyaa.si url
 * @returns Configured EmbedBuilder
 */
export async function buildNyaaEmbed(
    info: NyaaTorrentInfo,
    url: string,
    provider: "nyaa" | "sukebei" = "nyaa"
): Promise<EmbedBuilder[]> {
    const domain = provider === "sukebei" ? "sukebei.nyaa.si" : "nyaa.si";

    const authorName = info.uploader || "nyaa";
    const isAnonymous = authorName.toLowerCase() === "anonymous" || authorName === "nyaa";
    const authorUrl = isAnonymous ? `https://${domain}/` : `https://${domain}/user/${encodeURIComponent(authorName)}`;

    const embed = new EmbedBuilder()
        .setColor(NYAA_COLOR)
        .setURL(url)
        .setTitle(info.title.slice(0, 256))
        .setAuthor({
            name: authorName,
            iconURL: `https://${domain}/static/img/avatar/default.png`,
            url: authorUrl
        })
        .setThumbnail(`https://${domain}/static/img/avatar/default.png`);

    embed.addFields(
        { name: "Category", value: info.category, inline: true },
        { name: "Uploader", value: info.uploader, inline: true }
    );

    if (info.information) {
        embed.addFields({ name: "Information", value: info.information, inline: true });
    }

    // Ensure they align correctly
    if (!info.information) {
        embed.addFields({ name: "\u200B", value: "\u200B", inline: true });
    }

    embed.addFields(
        { name: "⬆️ Seeds", value: info.seeds.toString(), inline: true },
        { name: "⬇️ Leechers", value: info.leechers.toString(), inline: true },
        { name: "✅ Completed", value: info.completed.toString(), inline: true },
        { name: "💾 Size", value: info.size, inline: true },
        { name: "📅 Date", value: info.date, inline: true },
        {
            name: "ℹ️ Info Hash",
            value: ` ${info.infoHash}`,
            inline: false
        }
    );

    // Try to parse the date as proper ISO timestamp if possible, else skip
    try {
        if (info.date && info.date !== "Unknown") {
            const parsedDate = new Date(info.date.replace(" UTC", "Z"));
            if (!isNaN(parsedDate.getTime())) {
                embed.setTimestamp(parsedDate);
            }
        }
    } catch {}

    // Extract images from description
    const descriptionImages = extractImageUrls(info.information || "");

    // Fetch AnimeTosho images for better quality
    if (info.infoHash && info.infoHash !== "Unknown") {
        const images = await fetchAnimeImages(info.infoHash);

        // Set thumbnail: prioritize animetosho cover (main priority), then screenshot, then anilist cover
        if (images.cover) {
            embed.setThumbnail(images.cover);
        } else if (images.screenshots.length > 0) {
            embed.setThumbnail(images.screenshots[0] || null);
        } else {
            const fallbackCover = await fetchAnilistCoverByTitle(info.title);
            if (fallbackCover) {
                embed.setThumbnail(fallbackCover);
            }
        }

        // Set main image: priority is description images -> animetosho screenshots -> animetosho cover -> anilist cover
        if (descriptionImages.length > 0) {
            embed.setImage(descriptionImages[0]!);
        } else if (images.screenshots.length > 0) {
            embed.setImage(images.screenshots[0] || null);
        } else if (images.cover) {
            embed.setImage(images.cover);
        } else {
            const fallbackCover = await fetchAnilistCoverByTitle(info.title);
            if (fallbackCover) {
                embed.setImage(fallbackCover);
            }
        }

        if (images.directDownloads.length > 0) {
            const ddlLinks = images.directDownloads
                .slice(0, 5)
                .map(dl => `[${dl.name}](${dl.url})`)
                .join(" | ");

            const fields = embed.data.fields || [];
            const atIndex = fields.findIndex(f => f.name === "⬇️ AnimeTosho");
            if (atIndex !== -1) {
                fields[atIndex] = {
                    ...fields[atIndex],
                    name: "⬇️ Downloads",
                    value: `${ddlLinks}\n*[View on AnimeTosho](https://animetosho.org/view/${info.infoHash})*`
                };
            }
        }
    } else {
        // No infohash: use description images or anilist cover
        if (descriptionImages.length > 0) {
            embed.setImage(descriptionImages[0]!);
            embed.setThumbnail(descriptionImages[0]!);
        } else {
            const fallbackCover = await fetchAnilistCoverByTitle(info.title);
            if (fallbackCover) {
                embed.setImage(fallbackCover);
                embed.setThumbnail(fallbackCover);
            }
        }
    }

    const embeds: EmbedBuilder[] = [embed];
    return embeds;
}
