/**
 * Nyaa.si Types
 * Type definitions for nyaa.si torrent scraping and NyaaAPI
 */

export interface NyaaComment {
    user: string;
    profileUrl: string;
    avatar: string;
    commentBody: string;
    time: string;
    link: string;
}

export interface NyaaApiResponse {
    id: number;
    title: string;
    category: string;
    uploader: string | null;
    information: string | null;
    seeders: number;
    leechers: number;
    downloads: number;
    size: string;
    time: string;
    torrent: string | null;
    magnet: string;
    infohash: string;
    comments: NyaaComment[];
}

/** Information extracted from a nyaa.si torrent page */
export interface NyaaTorrentInfo {
    title: string;
    category: string;
    uploader: string;
    information: string | null;
    seeds: number;
    leechers: number;
    completed: number;
    size: string;
    date: string;
    infoHash: string;
    magnetLink: string;
    torrentUrl: string | null;
}
