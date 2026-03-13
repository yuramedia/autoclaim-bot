/**
 * Nyaa.si Service
 * Fetches and parses torrent pages from nyaa.si, and builds rich embeds
 */

import axios from "axios";
import { EmbedBuilder } from "discord.js";
import type { NyaaTorrentInfo, NyaaComment, NyaaApiResponse } from "../types/nyaa";
import { PlatformId } from "../types/embed-fix";
import { PLATFORMS } from "../constants/embed-fix";

const NYAA_COLOR = PLATFORMS.find(p => p.id === PlatformId.NYAA)?.color ?? 0x0089ff;

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
): Promise<{ comment: NyaaComment; torrentTitle: string } | null> {
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
            torrentTitle: data.title
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
export function buildNyaaCommentEmbed(
    comment: NyaaComment,
    torrentTitle: string,
    url: string,
    provider: "nyaa" | "sukebei" = "nyaa"
): EmbedBuilder[] {
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

    return [embed];
}

/**
 * Build rich Discord embed from Nyaa torrent information
 * @param info - Parsed Nyaa torrent info
 * @param url - Original Nyaa.si url
 * @returns Configured EmbedBuilder
 */
export function buildNyaaEmbed(
    info: NyaaTorrentInfo,
    url: string,
    provider: "nyaa" | "sukebei" = "nyaa"
): EmbedBuilder[] {
    const domain = provider === "sukebei" ? "sukebei.nyaa.si" : "nyaa.si";

    const embed = new EmbedBuilder()
        .setColor(NYAA_COLOR)
        .setURL(url)
        .setTitle(info.title.slice(0, 256))
        .setAuthor({
            name: info.uploader || "nyaa",
            iconURL: `https://${domain}/static/img/avatar/default.png`,
            url: `https://${domain}/`
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
        { name: "ℹ️ Info Hash", value: `\`${info.infoHash}\``, inline: false }
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

    const embeds: EmbedBuilder[] = [embed];
    return embeds;
}
