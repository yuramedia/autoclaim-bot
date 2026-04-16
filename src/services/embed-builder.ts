/**
 * Embed Builder Service
 * Creates rich Discord embeds with author info, images, and stats
 */

import { EmbedBuilder } from "discord.js";
import axios from "axios";
import * as cheerio from "cheerio";
import { PlatformId } from "../types/embed-fix";
import { fetchTikTokInfo } from "./tiktok.js";
import type { PlatformConfig } from "../types/embed-fix";
import type { PostInfo } from "../types";

// Re-export types for backwards compatibility
export type { PostInfo };

/**
 * Format number for display (1000 -> 1K, 1000000 -> 1M)
 */
function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}

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
 * Build rich Discord embed from post info
 * @param info - Post information
 * @param platform - Platform configuration
 * @returns Configured EmbedBuilder
 */
export function buildRichEmbed(info: PostInfo, platform: PlatformConfig, postUrl?: string): EmbedBuilder[] {
    const embed = new EmbedBuilder().setColor(platform.color);

    // Set URL on main embed (required for Discord multi-image gallery grouping)
    if (postUrl) {
        embed.setURL(postUrl);
    }

    // Author
    if (info.author.name) {
        let displayName = info.author.name;
        // Hanya tambahkan username jika bukan dari Facebook dan bukan 'unknown'
        if (
            platform.id !== PlatformId.FACEBOOK &&
            info.author.username &&
            info.author.username.toLowerCase() !== "unknown"
        ) {
            displayName += ` (@${info.author.username})`;
        }

        let avatarUrl = info.author.avatar;
        // Fallback to Facebook logo if avatar is missing
        if (!avatarUrl && platform.id === PlatformId.FACEBOOK) {
            avatarUrl = "https://upload.wikimedia.org/wikipedia/commons/6/6c/Facebook_Logo_2023.png";
        } else if (!avatarUrl && platform.id === PlatformId.TIKTOK) {
            avatarUrl = "https://cdn.pixabay.com/photo/2021/01/30/08/04/tiktok-5963032_1280.png";
        }

        embed.setAuthor({
            name: displayName,
            iconURL: avatarUrl,
            url: info.author.url
        });
    }

    // Description (post content)
    if (info.content) {
        embed.setDescription(info.content.slice(0, 4000));
    }

    // Image
    if (info.images.length > 0 && info.images[0]) {
        embed.setImage(info.images[0]);
    }

    // Stats footer
    const stats = [];
    if (info.stats.comments > 0) stats.push(`💬 ${formatNumber(info.stats.comments)}`);
    if (info.stats.reposts > 0) stats.push(`🔁 ${formatNumber(info.stats.reposts)}`);
    if (info.stats.likes > 0) stats.push(`❤️ ${formatNumber(info.stats.likes)}`);

    if (stats.length > 0) {
        embed.setFooter({ text: stats.join("  ") });
    }

    // Timestamp
    if (info.timestamp) {
        embed.setTimestamp(info.timestamp);
    }

    const embeds: EmbedBuilder[] = [embed];

    // Create additional embeds for extra images (2nd, 3rd, 4th, etc.)
    // Discord groups embeds with the same URL into a multi-image gallery
    if (postUrl && info.images.length > 1) {
        for (let i = 1; i < info.images.length; i++) {
            const imageEmbed = new EmbedBuilder().setURL(postUrl).setImage(info.images[i]!).setColor(platform.color);
            embeds.push(imageEmbed);
        }
    }

    return embeds;
}

/**
 * Fetch Twitter/X post info via fxtwitter API
 * @param statusId - Tweet status ID
 * @returns Post info or null on error
 */
export async function fetchTwitterInfo(statusId: string): Promise<PostInfo | null> {
    try {
        const response = await axios.get(`https://api.fxtwitter.com/status/${statusId}`, {
            timeout: 10000
        });

        const tweet = response.data?.tweet;
        if (!tweet) return null;

        return {
            author: {
                name: tweet.author?.name || "Unknown",
                username: tweet.author?.screen_name || "unknown",
                avatar: tweet.author?.avatar_url,
                url: `https://twitter.com/${tweet.author?.screen_name}`
            },
            content: tweet.text || "",
            images: tweet.media?.photos?.map((p: any) => p.url) || [],
            video: tweet.media?.videos?.[0]?.url,
            stats: {
                likes: tweet.likes || 0,
                reposts: tweet.retweets || 0,
                comments: tweet.replies || 0
            },
            timestamp: tweet.created_at ? new Date(tweet.created_at) : undefined
        };
    } catch (error) {
        console.error("Failed to fetch Twitter info:", error);
        return null;
    }
}

/**
 * Fetch Bluesky post info via public API
 * @param url - Bluesky post URL
 * @returns Post info or null on error
 */
export async function fetchBlueskyInfo(url: string): Promise<PostInfo | null> {
    try {
        // Extract handle and post ID from URL
        const match = url.match(/\/profile\/([\w.]+)\/post\/(\w+)/);
        if (!match) return null;

        const [, handle, postId] = match;

        // Resolve handle to DID
        const resolveResponse = await axios.get(
            `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${handle}`,
            { timeout: 10000 }
        );

        const did = resolveResponse.data?.did;
        if (!did) return null;

        // Fetch post
        const uri = `at://${did}/app.bsky.feed.post/${postId}`;
        const threadResponse = await axios.get(
            `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(uri)}&depth=0`,
            { timeout: 10000 }
        );

        const post = threadResponse.data?.thread?.post;
        if (!post) return null;

        const author = post.author;
        const record = post.record;

        // Extract images
        const images: string[] = [];
        if (post.embed?.images) {
            for (const img of post.embed.images) {
                if (img.fullsize) images.push(img.fullsize);
                else if (img.thumb) images.push(img.thumb);
            }
        }

        return {
            author: {
                name: author.displayName || author.handle,
                username: author.handle,
                avatar: author.avatar,
                url: `https://bsky.app/profile/${author.handle}`
            },
            content: record?.text || "",
            images,
            stats: {
                likes: post.likeCount || 0,
                reposts: post.repostCount || 0,
                comments: post.replyCount || 0
            },
            timestamp: record?.createdAt ? new Date(record.createdAt) : undefined
        };
    } catch (error) {
        console.error("Failed to fetch Bluesky info:", error);
        return null;
    }
}

/**
 * Fetch Facebook post info via facebed.com OpenGraph data
 * @param url - Facebook post URL
 * @returns Post info or null on error
 */
export async function fetchFacebookInfo(url: string): Promise<PostInfo | null> {
    try {
        const res = await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"
            },
            timeout: 10000
        });

        const $ = cheerio.load(res.data);
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

        const title = tags["og:title"] || "Facebook User";
        const isLoginWall = title === "Log in or sign up to view";

        if (isLoginWall) return null; // Post might be private or unavailable

        // Facebed's site_name contains stats: "facebed by pi.kt\n⌚ 2026/03/24 07:40:29 UTC+07\n❤️ 958 • 💬 108 • 🔁 158"
        const siteName = tags["og:site_name"] || "";
        const likesMatch = siteName.match(/❤️\s*([\d,.KkMm]+)/);
        const commentsMatch = siteName.match(/💬\s*([\d,.KkMm]+)/);
        const sharesMatch = siteName.match(/🔁\s*([\d,.KkMm]+)/);

        // Extract dates if available (⌚ 2026/03/24 07:40:29 UTC+07)
        const dateMatch = siteName.match(/⌚\s*(.+)\n/);
        let timestamp: Date | undefined;
        if (dateMatch && dateMatch[1]) {
            timestamp = new Date(dateMatch[1].replace(" UTC", "Z"));
            if (isNaN(timestamp.getTime())) timestamp = undefined;
        }

        // Get images
        const images: string[] = [];
        const authorName = tags["og:title"] || "Facebook User";
        const urlMatch = tags["og:url"] || url;

        let username = "facebook";
        if (urlMatch) {
            try {
                const urlObj = new URL(urlMatch);
                if (urlObj.hostname.includes("facebook.com") || urlObj.hostname.includes("facebed.com")) {
                    const pathParts = urlObj.pathname.split("/").filter(Boolean);
                    // Common paths to ignore when extracting username from URL
                    const ignoreWords = ["reel", "share", "groups", "watch", "photo", "events", "gaming", "permalink"];
                    if (pathParts.length > 0) {
                        const firstPart = pathParts[0] as string;
                        const isIgnored = ignoreWords.includes(firstPart.toLowerCase());
                        const isPhp = firstPart.toLowerCase().endsWith(".php");

                        // Treat as user only if it's not a common sub-path and not a PHP script
                        if (!isIgnored && !isPhp && firstPart !== "profile.php") {
                            username = firstPart;
                        }
                    }
                }
            } catch {
                // Ignore URL parse errors
            }
        }

        if (tags["og:image"]) images.push(tags["og:image"]);

        return {
            author: {
                name: authorName,
                username,
                avatar: tags["og:image"] || undefined,
                url: urlMatch
            },
            content: tags["og:description"] || "",
            images,
            video: tags["og:video"] || tags["og:video:secure_url"],
            stats: {
                likes: parseStat(likesMatch?.[1]),
                comments: parseStat(commentsMatch?.[1]),
                reposts: parseStat(sharesMatch?.[1])
            },
            timestamp
        };
    } catch (error) {
        console.error("Failed to fetch Facebook info:", error);
        return null;
    }
}

/**
 * Fetch post info based on platform
 * @param url - Post URL
 * @param platform - Platform configuration
 * @param postId - Extracted post ID
 * @returns Post info or null
 */
export async function fetchPostInfo(
    url: string,
    platform: PlatformConfig,
    postId: string | null
): Promise<PostInfo | null> {
    switch (platform.id) {
        case PlatformId.TWITTER:
            if (postId) return fetchTwitterInfo(postId);
            break;
        case PlatformId.BLUESKY:
            return fetchBlueskyInfo(url);
        case PlatformId.FACEBOOK:
            return fetchFacebookInfo(url);
        case PlatformId.TIKTOK:
            return fetchTikTokInfo(url);
        // Add more platforms as needed
    }
    return null;
}
