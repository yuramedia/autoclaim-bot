/**
 * Embed Fix Types
 * Type definitions for social media URL detection and fixing
 */

/** Supported platforms for URL fixing */
export enum PlatformId {
    TWITTER = "twitter",
    TIKTOK = "tiktok",
    REDDIT = "reddit",
    INSTAGRAM = "instagram",
    PIXIV = "pixiv",
    BLUESKY = "bluesky",
    THREADS = "threads",
    FACEBOOK = "facebook",
    WEIBO = "weibo",
    MISSKEY = "misskey",
    PLURK = "plurk",
    NYAA = "nyaa"
}

/** Configuration for a specific platform */
export interface PlatformConfig {
    id: PlatformId;
    name: string;
    color: number;
    patterns: RegExp[];
    fixes: { oldDomain: string; newDomain: string }[];
}

/** Result of processing a URL */
export interface ProcessedUrl {
    originalUrl: string;
    fixedUrl: string;
    platform: PlatformConfig;
    postId: string | null;
    spoilered: boolean;
}
