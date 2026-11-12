/**
 * Embed Builder Service
 * Creates rich Discord embeds with author info, images, and stats
 */

import { EmbedBuilder } from "discord.js";
import { logger } from "../core/logger";
import axios from "axios";
import * as cheerio from "cheerio";
import { PlatformId } from "../types/embed-fix";
import { fetchTikTokInfo } from "./tiktok.js";
import { parseStat } from "../utils/stats.js";
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
            name: displayName.slice(0, 256),
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

    // Create additional embeds for extra images (up to 10 embeds total)
    // Discord groups embeds sharing the exact same URL into a 4-image grid.
    // Secondary embeds must ONLY specify URL and image (no color or other fields).
    if (postUrl && info.images.length > 1) {
        const totalImages = Math.min(info.images.length, 10);
        for (let i = 1; i < totalImages; i++) {
            const galleryGroup = Math.floor(i / 4);
            const galleryUrl = galleryGroup === 0 ? postUrl : `${postUrl}#${galleryGroup + 1}`;
            const imageEmbed = new EmbedBuilder().setURL(galleryUrl).setImage(info.images[i]!);
            embeds.push(imageEmbed);
        }
    }

    return embeds.slice(0, 10);
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

        // Collect all photos from photos array and/or media.all
        const photos: string[] = [];
        if (Array.isArray(tweet.media?.photos)) {
            for (const p of tweet.media.photos) {
                if (p.url && !photos.includes(p.url)) photos.push(p.url);
            }
        }
        if (photos.length === 0 && Array.isArray(tweet.media?.all)) {
            for (const m of tweet.media.all) {
                if (m.type === "photo" && m.url && !photos.includes(m.url)) {
                    photos.push(m.url);
                }
            }
        }

        // Collect all video URLs and video thumbnails
        const videoUrls: string[] = [];
        const videoThumbnails: string[] = [];
        if (Array.isArray(tweet.media?.videos)) {
            for (const v of tweet.media.videos) {
                if (v.url && !videoUrls.includes(v.url)) videoUrls.push(v.url);
                if (v.thumbnail_url && !videoThumbnails.includes(v.thumbnail_url)) {
                    videoThumbnails.push(v.thumbnail_url);
                }
            }
        }
        if (videoUrls.length === 0 && Array.isArray(tweet.media?.all)) {
            for (const m of tweet.media.all) {
                if (m.type === "video") {
                    if (m.url && !videoUrls.includes(m.url)) videoUrls.push(m.url);
                    if (m.thumbnail_url && !videoThumbnails.includes(m.thumbnail_url)) {
                        videoThumbnails.push(m.thumbnail_url);
                    }
                }
            }
        }

        // Only use actual photos for embed images.
        // Do not use video thumbnails as images, otherwise Discord shows a redundant
        // static thumbnail picture right below the playable video attachment.
        const images = photos;

        return {
            author: {
                name: tweet.author?.name || "Unknown",
                username: tweet.author?.screen_name || "unknown",
                avatar: tweet.author?.avatar_url,
                url: tweet.author?.screen_name ? `https://twitter.com/${tweet.author.screen_name}` : undefined
            },
            content: tweet.text || "",
            images,
            video: videoUrls[0],
            videos: videoUrls,
            stats: {
                likes: tweet.likes || 0,
                reposts: tweet.retweets || 0,
                comments: tweet.replies || 0
            },
            timestamp: tweet.created_at ? new Date(tweet.created_at) : undefined
        };
    } catch (error) {
        logger.error(error as Error, "Failed to fetch Twitter info");
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
        // Extract handle (or DID) and post ID from URL
        const match = url.match(/\/profile\/([\w.:-]+)\/post\/(\w+)/);
        if (!match) return null;

        const [, actor, postId] = match;
        let did = actor?.startsWith("did:") ? actor : null;

        if (!did) {
            // Resolve handle to DID
            const resolveResponse = await axios.get(
                `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor!)}`,
                { timeout: 10000 }
            );
            did = resolveResponse.data?.did ?? null;
        }
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

        // Extract images and video thumbnails
        const images: string[] = [];
        const bskyMedia = post.embed?.images || post.embed?.media?.images;
        if (Array.isArray(bskyMedia)) {
            for (const img of bskyMedia) {
                if (img.fullsize && !images.includes(img.fullsize)) images.push(img.fullsize);
                else if (img.thumb && !images.includes(img.thumb)) images.push(img.thumb);
            }
        }
        if (images.length === 0 && post.embed?.thumbnail) {
            images.push(post.embed.thumbnail);
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
        logger.error(error as Error, "Failed to fetch Bluesky info");
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

        $('meta[property^="og:"]').each((_, el) => {
            const prop = $(el).attr("property");
            const content = $(el).attr("content");
            if (prop && content) tags[prop] = content;
        });

        $('meta[name^="twitter:"]').each((_, el) => {
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
        const dateMatch = siteName.match(
            /⌚\s*(\d{4})[/-](\d{2})[/-](\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\s*UTC([+-]\d{1,2}(?::?\d{2})?)|\s*Z)?/i
        );
        let timestamp: Date | undefined;
        if (dateMatch) {
            const [, y, m, d, time, offset] = dateMatch;
            let isoStr = `${y}-${m}-${d}T${time}`;
            if (offset) {
                const normalizedOffset = offset.includes(":") ? offset : offset.length === 3 ? `${offset}:00` : offset;
                isoStr += normalizedOffset;
            } else {
                isoStr += "Z";
            }
            const parsed = new Date(isoStr);
            if (!isNaN(parsed.getTime())) {
                timestamp = parsed;
            }
        }

        // Get images
        const ogImages: string[] = [];
        $('meta[property="og:image"], meta[name="og:image"]').each((_, el) => {
            const content = $(el).attr("content");
            if (content && !ogImages.includes(content)) {
                ogImages.push(content);
            }
        });
        $('meta[name="twitter:image"], meta[name="twitter:image:src"]').each((_, el) => {
            const content = $(el).attr("content");
            if (content && !ogImages.includes(content)) {
                ogImages.push(content);
            }
        });

        const video = tags["og:video"] || tags["og:video:secure_url"];

        // If post has video, keep images empty so Discord does not show a redundant static thumbnail
        const images: string[] = video
            ? []
            : ogImages.length > 0
              ? ogImages
              : tags["og:image"]
                ? [tags["og:image"]]
                : [];
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

        if (!video && tags["og:image"] && !images.includes(tags["og:image"])) {
            images.push(tags["og:image"]);
        }

        return {
            author: {
                name: authorName,
                username,
                avatar: tags["og:image"] || undefined,
                url: urlMatch
            },
            content: tags["og:description"] || "",
            images,
            video,
            stats: {
                likes: parseStat(likesMatch?.[1]),
                comments: parseStat(commentsMatch?.[1]),
                reposts: parseStat(sharesMatch?.[1])
            },
            timestamp
        };
    } catch (error) {
        logger.error(error as Error, "Failed to fetch Facebook info");
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
    try {
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
    } catch (error) {
        logger.error(error as Error, `Error fetching post info for platform ${platform.id}`);
    }
    return null;
}
