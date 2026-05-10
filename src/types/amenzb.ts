/**
 * ameNZB Types
 * Type definitions for ameNZB Newznab-compatible Search API
 */

/** Images fetched from ameNZB for a given infohash */
export interface AmeNZBImages {
    /** Screenshot URLs from ameNZB release page */
    screenshots: string[];
    /** Cover image URL (from ameNZB or Anilist fallback) */
    cover: string | null;
    /** ameNZB numeric release ID */
    nzbId: string | null;
}

/** Parsed Newznab XML <item> from ameNZB search response */
export interface AmeNZBNewznabItem {
    /** Release title */
    title: string;
    /** ameNZB release page URL */
    link: string;
    /** NZB GUID (numeric release ID) */
    guid: string;
    /** Publication date string */
    pubDate: string;
    /** File size in bytes */
    size: string;
    /** Video resolution (e.g. "1080p", "720p") */
    resolution: string;
    /** Source type (e.g. "WEB-DL", "BluRay") */
    source: string;
    /** Newznab category code (e.g. "5070" for Anime) */
    category: string;
    /** Season number */
    season: string;
    /** Episode number */
    episode: string;
    /** Download count */
    grabs: string;
    /** Video codec (e.g. "HEVC", "H264") */
    video: string;
}
