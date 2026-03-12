/**
 * Embed Builder Service
 * Creates rich Discord embeds with author info, images, and stats
 */

import { EmbedBuilder } from "discord.js";
import axios from "axios";
import { PlatformId } from "../types/embed-fix";
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
    if (info.author.name && info.author.username) {
        embed.setAuthor({
            name: `${info.author.name} (@${info.author.username})`,
            iconURL: info.author.avatar,
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
        // Add more platforms as needed
    }
    return null;
}
