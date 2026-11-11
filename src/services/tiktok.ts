import axios from "axios";
import * as cheerio from "cheerio";
import { parseStat } from "../utils/stats.js";
import type { PostInfo } from "../types/index.js";
import { logger } from "../core/logger.js";

/**
 * Fetch TikTok post info via tnktok.com by extracting OpenGraph tags
 * @param url - tnktok.com URL to fetch (with domain already fixed)
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
        const ogImages: string[] = [];

        $('meta[property^="og:"]').each((_, el) => {
            const prop = $(el).attr("property");
            const content = $(el).attr("content");
            if (prop && content) {
                tags[prop] = content;
                if (prop === "og:image" && !ogImages.includes(content)) {
                    ogImages.push(content);
                }
            }
        });

        $('meta[name^="twitter:"]').each((_, el) => {
            const name = $(el).attr("name");
            const content = $(el).attr("content");
            if (name && content) {
                tags[name] = content;
                if ((name === "twitter:image" || name === "twitter:image:src") && !ogImages.includes(content)) {
                    ogImages.push(content);
                }
            }
        });

        const title = tags["og:title"] || $("title").text();
        if (!title) return null;

        const description = tags["og:description"] || "";
        const videoUrl = tags["og:video"] || tags["og:video:secure_url"];
        const sourceUrl = tags["og:url"] || url;

        // Extract username from title if it contains (@username)
        let authorName = "TikTok";
        let username = "unknown";
        const titleMatch = title.match(/^(.+?)\s*\(@([\w.]+)\)$/);
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

        // Get images - if post is a video, do not populate images with video thumbnail
        // so Discord does not show a redundant static thumbnail image under the video attachment.
        const images: string[] = videoUrl ? [] : [...ogImages];
        if (images.length === 0 && !videoUrl && tags["og:image"]) images.push(tags["og:image"]);

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
    } catch (error: unknown) {
        const err = error as { response?: { status?: number }; message?: string };
        if (err.response?.status !== 404) {
            logger.error(error, `Error fetching TikTok info for ${url}`);
        }
        return null;
    }
}
