/**
 * U2 Torrent Feed Types
 * Types for U2 (u2.dmhy.org) RSS feed parsing
 */

/** Raw RSS feed item parsed from XML */
export interface U2FeedItem {
    /** Torrent title (includes tags, resolution, size, uploader) */
    title: string;
    /** Details page URL */
    link: string;
    /** HTML description with images and BD info */
    description: string;
    /** Uploader email-style string */
    author: string;
    /** Category (e.g. "BDMV") */
    category: string;
    /** Torrent info hash */
    guid: string;
    /** Download URL from enclosure */
    downloadUrl: string;
    /** File size in bytes from enclosure */
    sizeBytes: number;
    /** Publication date string (RFC 2822) */
    pubDate: string;
}

/** Formatted feed item ready for Discord embed */
export interface FormattedU2Item {
    /** Cleaned title */
    title: string;
    /** Details page URL */
    link: string;
    /** First image found in description */
    image: string | null;
    /** Category (e.g. "BDMV") */
    category: string;
    /** Uploader name (extracted from author field) */
    uploader: string;
    /** Human-readable file size */
    size: string;
    /** Publication date */
    pubDate: Date;
    /** Torrent info hash (used as unique ID) */
    guid: string;
}

/** Guild settings for U2 feed */
export interface IU2FeedSettings {
    /** Whether the feed is enabled */
    enabled: boolean;
    /** Channel to post notifications */
    channelId: string | null;
    /** Optional regex filter for titles (e.g. "BDMV") */
    filter: string;
}
