/**
 * U2 Torrent Feed Types
 * Types for U2 (u2.dmhy.org) RSS feed parsing
 */

import type { IU2FeedSettings } from "../database/models/guild-settings";

export type { IU2FeedSettings };

/** Raw parsed feed item from RSS XML */
export interface U2FeedItem {
    /** Raw title (may contain HTML entities) */
    title: string;
    /** Author field (e.g. "user@u2.dmhy.org (user)") */
    author: string;
    /** Category (e.g. "BDMV") */
    category: string;
    /** HTML description containing images and BD info */
    description: string;
    /** Torrent info hash (unique ID) */
    guid: string;
    /** Details page URL */
    link: string;
    /** RFC 2822 date string */
    pubDate: string;
    /** File size in bytes from enclosure (if available) */
    sizeBytes: number | null;
}

/** Formatted feed item ready for Discord embed */
export interface FormattedU2Item {
    /** Cleaned, HTML-unescaped title */
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
    /** Unix timestamp of publication */
    pubDateUnix: number;
    /** Torrent info hash (used as unique ID) */
    guid: string;
    /** Whether this item was already posted to Discord */
    wasPosted: boolean;
}
