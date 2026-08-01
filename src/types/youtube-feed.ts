/**
 * YouTube Feed Types
 */

import type { IYouTubeFeedSettings, IYouTubeFeedChannel } from "../database/models/guild-settings";

export type { IYouTubeFeedSettings, IYouTubeFeedChannel };

/** Raw parsed feed entry from YouTube Atom XML */
export interface YouTubeFeedEntry {
    /** Unique video ID */
    videoId: string;
    /** Video title */
    title: string;
    /** YouTube channel ID (UC...) */
    channelId: string;
    /** Channel author name */
    channelName: string;
    /** ISO date string when video was published */
    published: string;
    /** ISO date string when video was updated */
    updated: string;
    /** Video thumbnail URL */
    thumbnail: string | null;
    /** Video description */
    description: string;
    /** Direct video URL */
    link: string;
}

export type YouTubeVideoStatusType = "upcoming" | "live" | "video";

/** Formatted feed item ready for Discord embed */
export interface FormattedYouTubeVideo {
    /** Video ID */
    videoId: string;
    /** Clean title */
    title: string;
    /** Direct video URL */
    videoUrl: string;
    /** Video thumbnail image URL */
    thumbnail: string | null;
    /** Channel name */
    channelName: string;
    /** Channel URL */
    channelUrl: string;
    /** Published Date object */
    publishedAt: Date;
    /** Unix timestamp in seconds */
    publishedUnix: number;
    /** Shortened description */
    description: string;
    /** Smart status badge type ("upcoming" | "live" | "video") */
    statusType: YouTubeVideoStatusType;
    /** Scheduled start time unix timestamp in seconds (if applicable) */
    scheduledStartTimeUnix: number | null;
    /** Whether item was posted to Discord */
    wasPosted: boolean;
    /** Last status posted to Discord ("upcoming" | "live" | "video") */
    lastPostedStatus?: YouTubeVideoStatusType;
}
