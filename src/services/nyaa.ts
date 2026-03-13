/**
 * Nyaa.si Service
 * Fetches and parses torrent pages from nyaa.si, and builds rich embeds
 */

import axios from "axios";
import * as cheerio from "cheerio";
import { EmbedBuilder } from "discord.js";
import type { NyaaTorrentInfo } from "../types/nyaa";
import { PlatformId } from "../types/embed-fix";
import { PLATFORMS } from "../constants/embed-fix";

const NYAA_COLOR = PLATFORMS.find(p => p.id === PlatformId.NYAA)?.color ?? 0x0089ff;

/**
 * Fetch and extract torrent information from a nyaa.si view page
 * @param viewId - The ID of the torrent page
 * @returns Parsed torrent information or null if failed
 */
export async function fetchNyaaInfo(viewId: string): Promise<NyaaTorrentInfo | null> {
    try {
        const url = `https://nyaa.si/view/${viewId}`;
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
        });

        const $ = cheerio.load(response.data);

        // Extract title
        const title = $("h3.panel-title").text().trim();
        if (!title) return null;

        // Extract metadata from the rows
        let category = "Unknown";
        let uploader = "Anonymous";
        let information: string | null = null;
        let size = "Unknown";
        let date = "Unknown";
        let seeds = 0;
        let leechers = 0;
        let completed = 0;
        let infoHash = "Unknown";

        // Category
        const catElem = $("div.row:contains('Category:')").first();
        if (catElem.length) {
            category = catElem.find(".col-md-5").first().text().trim() || category;
            // Clean up extra spaces/newlines
            category = category.replace(/\s+/g, " ").trim();
        }

        // Uploader
        const uploaderElem = $("div.row:contains('Submitter:')").first();
        if (uploaderElem.length) {
            uploader = uploaderElem.find(".col-md-5").first().text().trim() || uploader;
        }

        // Information
        const infoElem = $("div.row:contains('Information:')").first();
        if (infoElem.length) {
            const link = infoElem.find("a").attr("href");
            information = link ? link.trim() : infoElem.find(".col-md-5").first().text().trim();
            if (information === "No information") information = null;
        }

        // Date
        const dateElem = $("div.row:contains('Date:')").first();
        if (dateElem.length) {
            date = dateElem.find(".col-md-5").first().text().trim() || date;
        }

        // Size
        const sizeElem = $("div.row:contains('File size:')").first();
        if (sizeElem.length) {
            size = sizeElem.find(".col-md-5").first().text().trim() || size;
        }

        // Seeds
        const seedsElem = $("div.row:contains('Seeders:')").first();
        if (seedsElem.length) {
            seeds = parseInt(seedsElem.find(".col-md-5").first().text().trim(), 10) || 0;
        }

        // Leechers
        const leechElem = $("div.row:contains('Leechers:')").first();
        if (leechElem.length) {
            leechers = parseInt(leechElem.find(".col-md-5").first().text().trim(), 10) || 0;
        }

        // Completed
        const compElem = $("div.row:contains('Completed:')").first();
        if (compElem.length) {
            completed = parseInt(compElem.find(".col-md-5").first().text().trim(), 10) || 0;
        }

        // Info hash
        const hashElem = $("div.row:contains('Info hash:')").first();
        if (hashElem.length) {
            infoHash = hashElem.find("kbd").text().trim() || hashElem.find(".col-md-5").first().text().trim();
        }

        // Links
        const torrentUrl =
            $(".panel-footer a")
                .filter((i, el) => $(el).attr("href")?.endsWith(".torrent") === true)
                .attr("href") || null;
        const magnetLink = $(".panel-footer a[href^='magnet:']").attr("href") || "";

        return {
            title,
            category,
            uploader,
            information,
            seeds,
            leechers,
            completed,
            size,
            date,
            infoHash,
            magnetLink,
            torrentUrl: torrentUrl ? `https://nyaa.si${torrentUrl}` : null
        };
    } catch (error) {
        console.error(`Failed to fetch Nyaa.si info for ${viewId}:`, error);
        return null;
    }
}

/**
 * Build rich Discord embed from Nyaa torrent information
 * @param info - Parsed Nyaa torrent info
 * @param url - Original Nyaa.si url
 * @returns Configured EmbedBuilder
 */
export function buildNyaaEmbed(info: NyaaTorrentInfo, url: string): EmbedBuilder[] {
    const embed = new EmbedBuilder()
        .setColor(NYAA_COLOR)
        .setURL(url)
        .setTitle(info.title.slice(0, 256))
        .setAuthor({
            name: "Nyaa",
            iconURL: "https://nyaa.si/static/img/avatar/default.png",
            url: "https://nyaa.si/"
        })
        .setThumbnail("https://nyaa.si/static/img/avatar/default.png");

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
