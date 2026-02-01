/**
 * Embed Builder Service
 * Creates rich Discord embeds with author info, images, and stats
 */

import { EmbedBuilder } from "discord.js";
import axios from "axios";
import { PlatformId, type PlatformConfig } from "./embed-fix";

export interface PostInfo {
    author: {
        name: string;
        username: string;
        avatar?: string;
        url?: string;
    };
    content: string;
    images: string[];
    video?: string;
    stats: {
        likes: number;
        reposts: number;
        comments: number;
    };
    timestamp?: Date;
}

// Format number for display (1000 -> 1K, 1000000 -> 1M)
function formatNumber(num: number): string {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
}

/**
 * Build rich Discord embed from post info
 */
export function buildRichEmbed(info: PostInfo, platform: PlatformConfig): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(platform.color);

    // Author
    if (info.author.name) {
        embed.setAuthor({
            name: `@${info.author.username}`,
            iconURL: info.author.avatar,
            url: info.author.url
        });
    }

    // Title (author display name)
    if (info.author.name !== info.author.username) {
        embed.setTitle(info.author.name);
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

    return embed;
}

/**
 * Fetch Twitter/X post info via fxtwitter API
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
 * Fetch Facebook post info via facebed.com OpenGraph scraping
 */
export async function fetchFacebookInfo(originalUrl: string): Promise<PostInfo | null> {
    try {
        // Convert original Facebook URL to facebed URL
        const facebedUrl = originalUrl.replace("facebook.com", "facebed.com");

        // Fetch the facebed page to get OpenGraph meta tags
        const response = await axios.get(facebedUrl, {
            timeout: 15000,
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"
            }
        });

        const html = response.data;

        // Extract OpenGraph meta tags
        const getMetaContent = (property: string): string => {
            const regex = new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']+)["']`, "i");
            const altRegex = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*property=["']${property}["']`, "i");
            const match = html.match(regex) || html.match(altRegex);
            return match ? match[1] : "";
        };

        const title = getMetaContent("og:title") || "Facebook";
        const description = getMetaContent("og:description") || "";
        const image = getMetaContent("og:image") || "";
        const videoUrl = getMetaContent("og:video") || getMetaContent("og:video:url") || "";

        // Try to extract stats from provider name if available
        // Format: "facebed by pi.kt\n⌚ 2026/02/01 03:25:09 UTC+07\n❤️ 99 • 💬 26 • 🔁 13"
        let likes = 0,
            comments = 0,
            reposts = 0;

        // Try to find stats in the page
        const statsMatch = html.match(/❤️\s*(\d+).*?💬\s*(\d+).*?🔁\s*(\d+)/);
        if (statsMatch) {
            likes = parseInt(statsMatch[1]) || 0;
            comments = parseInt(statsMatch[2]) || 0;
            reposts = parseInt(statsMatch[3]) || 0;
        }

        // If no stats found in HTML, check for oEmbed
        if (likes === 0 && comments === 0) {
            try {
                const oembedResponse = await axios.get(
                    `https://facebed.com/oembed?url=${encodeURIComponent(facebedUrl)}&format=json`,
                    { timeout: 5000 }
                );
                const oembedData = oembedResponse.data;
                // Parse provider_name for stats
                const providerName = oembedData?.provider_name || "";
                const oembedStats = providerName.match(/❤️\s*(\d+).*?💬\s*(\d+).*?🔁\s*(\d+)/);
                if (oembedStats) {
                    likes = parseInt(oembedStats[1]) || 0;
                    comments = parseInt(oembedStats[2]) || 0;
                    reposts = parseInt(oembedStats[3]) || 0;
                }
            } catch {
                // Ignore oEmbed errors
            }
        }

        return {
            author: {
                name: title,
                username: title,
                url: originalUrl
            },
            content: description,
            images: image ? [image] : [],
            video: videoUrl || undefined,
            stats: {
                likes,
                reposts,
                comments
            }
        };
    } catch (error) {
        console.error("Failed to fetch Facebook info:", error);
        return null;
    }
}

/**
 * Fetch post info based on platform
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
        // Add more platforms as needed
    }
    return null;
}
