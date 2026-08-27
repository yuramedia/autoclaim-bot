/**
 * NekoBT API Type Definitions
 */

/**
 * Represents the uploader object from NekoBT torrent API.
 */
export interface NekoBTUploader {
    id: string;
    username: string;
    display_name: string;
    pfp_hash: string | null;
}

/**
 * Represents a release group object from NekoBT torrent API.
 */
export interface NekoBTGroup {
    id: string;
    display_name: string;
    pfp_hash: string | null;
}

/**
 * Data payload for a single NekoBT torrent.
 */
export interface NekoBTTorrentData {
    id: string | number;
    uploaded_at: number | string;
    title: string;
    auto_title?: string;
    description?: string | null;
    filesize: string | number;
    magnet: string;
    infohash: string;
    seeders: string | number;
    leechers: string | number;
    completed: string | number;
    screenshots?: string[];
    uploader?: NekoBTUploader | null;
    groups?: NekoBTGroup[];
    animetosho?: unknown[] | string;
    animetosho_fetch_time?: string | null;
}

/**
 * Represents the response structure from NekoBT torrent API.
 */
export interface NekoBTTorrentResponse {
    error: boolean;
    message?: string;
    data: NekoBTTorrentData;
}
