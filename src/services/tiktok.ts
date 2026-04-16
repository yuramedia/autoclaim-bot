import axios from "axios";
import * as cheerio from "cheerio";
import type { PostInfo } from "../types/index.js";

/**
 * Parse string stats (like "1.5K", "2M") to number
 */
function parseStat(str?: string): number {
    if (!str) return 0;
    const clean = str.replace(/[^\d.]/g, "");
    let num = parseFloat(clean);
    if (str.toLowerCase().includes("k")) num *= 1000;
    if (str.toLowerCase().includes("m")) num *= 1000000;
    if (str.toLowerCase().includes("b")) num *= 1000000000;
    return Math.round(num) || 0;
}

/**
 * Fetch TikTok post info via vxtiktok.com by extracting OpenGraph tags
 * @param url - vxtiktok.com URL to fetch (with domain already fixed)
 * @param originalUrl - Original TikTok URL
 * @returns Post info or null on error
 */
export async function fetchTikTokInfo(url: string): Promise<PostInfo | null> {
    try {
        const response = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);
        const tags: Record<string, string> = {};

        $('meta[property^="og:"]').each((i, el) => {
            const prop = $(el).attr("property");
            const content = $(el).attr("content");
            if (prop && content) tags[prop] = content;
        });

        $('meta[name^="twitter:"]').each((i, el) => {
            const name = $(el).attr("name");
            const content = $(el).attr("content");
            if (name && content) tags[name] = content;
        });

        const title = tags["og:title"] || $("title").text();
        if (!title) return null;

        const description = tags["og:description"] || "";
        const videoUrl = tags["og:video"] || tags["og:video:secure_url"];
        const sourceUrl = tags["og:url"] || url;

        // Extract username from title if it contains (@username)
        let authorName = "TikTok";
        let username = "unknown";
        const titleMatch = title.match(/^(.+?)\s*\(@(\w+)\)$/);
        if (titleMatch) {
            authorName = titleMatch[1]!;
            username = titleMatch[2]!;
        } else if (title !== "TikTok") {
            authorName = title;
        }

        // Parse stats from description or site_name if available
        const siteName = tags["og:site_name"] || "";
        const statsText = siteName || description;
        const likesMatch = statsText.match(/❤️\s*([\d,.KkMm]+)/);
        const commentsMatch = statsText.match(/(💬|comments?)\s*([\d,.KkMm]+)/i);
        const repostsMatch = statsText.match(/(🔁|shares?|reposts?)\s*([\d,.KkMm]+)/i);

        // Get images
        const images: string[] = [];
        if (tags["og:image"]) images.push(tags["og:image"]);

        return {
            author: {
                name: authorName,
                username,
                url: sourceUrl
            },
            content: description.replace(/❤️\s*[\d,.KkMm]+|💬\s*[\d,.KkMm]+|🔁\s*[\d,.KkMm]+/gi, "").trim(), // Remove stats from content
            images,
            video: videoUrl || undefined,
            stats: {
                likes: parseStat(likesMatch?.[1]),
                comments: parseStat(commentsMatch?.[2]),
                reposts: parseStat(repostsMatch?.[2])
            }
        };
    } catch (error: any) {
        if (error.response?.status !== 404) {
            console.error(`Error fetching TikTok info for ${url}:`, error.message);
        }
        return null;
    }
}
