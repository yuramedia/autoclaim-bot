/**
 * Nyaa.si Types
 * Type definitions for nyaa.si torrent scraping and NyaaAPI
 */

/**
 * Represents a comment on a Nyaa torrent entry.
 */
export interface NyaaComment {
    /** Username of the commenter. */
    user: string;
    /** Profile URL of the commenter. */
    profileUrl: string;
    /** Avatar image URL of the commenter. */
    avatar: string;
    /** Content body of the comment. */
    commentBody: string;
    /** Timestamp/relative time of the comment. */
    time: string;
    /** Direct link to the comment. */
    link: string;
}

/**
 * Response structure for Nyaa API responses.
 */
export interface NyaaApiResponse {
    /** Unique torrent ID. */
    id: number;
    /** Title of the torrent. */
    title: string;
    /** Torrent category. */
    category: string;
    /** Username of the uploader, or null. */
    uploader: string | null;
    /** Information link or notes, or null. */
    information: string | null;
    /** Number of active seeders. */
    seeders: number;
    /** Number of active leechers. */
    leechers: number;
    /** Number of completed downloads. */
    downloads: number;
    /** Formatted file size string. */
    size: string;
    /** Upload timestamp. */
    time: string;
    /** Torrent file download URL, or null. */
    torrent: string | null;
    /** Magnet URI link. */
    magnet: string;
    /** Info hash string. */
    infohash: string;
    /** Array of user comments on the torrent. */
    comments: NyaaComment[];
}

/**
 * Information extracted from a nyaa.si torrent page.
 */
export interface NyaaTorrentInfo {
    /** Title of the torrent. */
    title: string;
    /** Category name. */
    category: string;
    /** Username of the uploader. */
    uploader: string;
    /** External information link or reference, or null. */
    information: string | null;
    /** Number of seeders. */
    seeds: number;
    /** Number of leechers. */
    leechers: number;
    /** Number of completed downloads. */
    completed: number;
    /** File size. */
    size: string;
    /** Upload date/time. */
    date: string;
    /** Info hash of the torrent. */
    infoHash: string;
    /** Magnet URI link. */
    magnetLink: string;
    /** Torrent download URL, or null. */
    torrentUrl: string | null;
}
