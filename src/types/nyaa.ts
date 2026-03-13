/**
 * Nyaa.si Types
 * Type definitions for nyaa.si torrent scraping
 */

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
