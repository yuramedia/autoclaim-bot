/**
 * Tsukihime API Types
 * Type definitions for the Tsukihime anime torrent indexer API (api.tsukihime.org/v1)
 * Used as an alternative metadata source to ameNZB for Nyaa and NekoBT embeds.
 */

/** Anime metadata embedded in torrent responses */
export interface TsukihimeAnime {
    /** Internal Tsukihime anime ID */
    id: number;
    /** Romaji/native anime title */
    title: string;
    /** English anime title */
    english_title: string | null;
    /** Thumbnail/cover URL (usually from AniList CDN or MAL) */
    thumbnail: string | null;
    /** Anime synopsis */
    synopsis: string | null;
    /** Genre tags (e.g. ["Action", "Fantasy"]) */
    genres: string[];
    /** Animation studio names */
    studios: string[];
    /** Release year */
    release_year: number | null;
    /** AniList ID for cross-referencing */
    anilist: number | null;
    /** MyAnimeList ID */
    mal: number | null;
    /** AniDB ID */
    anidb: number | null;
}

/** Release/fansub group info */
export interface TsukihimeGroup {
    /** Internal group ID */
    id: number;
    /** Group name (e.g. "SubsPlease", "Erai-raws") */
    name: string;
}

/** Tracker statistics for a torrent */
export interface TsukihimeTracker {
    /** Tracker tier priority */
    tier: number;
    /** Last update timestamp (Unix seconds) */
    lastupdate: number;
    /** Number of seeders */
    seeders: number;
    /** Number of leechers */
    leechers: number;
    /** Number of completed downloads */
    complete: number;
    /** Error flag (0 = ok, 1 = error) */
    error: number;
    /** Tracker announce URL */
    url: string;
}

/** Subtitle/audio attachment info within a file */
export interface TsukihimeAttachment {
    /** Attachment type (1 = subtitle, 3 = other) */
    type: number;
    /** Attachment metadata (present for subtitles) */
    info?: {
        codec: string;
        lang: string;
        name: string | null;
        default: number;
        cached: number;
        forced: number;
        trackid: number;
        tracknum: number;
    };
    /** Internal attachment ID */
    id: number;
}

/** File detail within a torrent */
export interface TsukihimeFile {
    /** Internal file ID */
    id: number;
    /** Processing state (e.g. "completed", "unprocessed") */
    state: string;
    /** Parent torrent ID */
    torrent_id: number;
    /** Original filename */
    filename: string;
    /** File size in bytes */
    size: number;
    /** Video frame numbers for screenshot generation */
    vidframes: number[];
    /** Audio-only download links */
    links_audio: Record<string, string>;
    /** Full file download links */
    links: Record<string, string>;
    /** Subtitle and other attachments */
    attachments: TsukihimeAttachment[];
    /** CRC32 checksum */
    crc32: string | null;
    /** MD5 hash */
    md5: string | null;
    /** SHA1 hash */
    sha1: string | null;
    /** ED2K hash */
    ed2k: string | null;
    /** Full MediaInfo text dump */
    mediainfo?: string | null;
}

/** Full torrent detail from Tsukihime API */
export interface TsukihimeTorrent {
    /** Internal Tsukihime torrent ID */
    id: number;
    /** Whether this torrent has an NZB available (0 or 1) */
    has_nzb: number;
    /** Main source tracker (1 = nyaa, 2 = sukebei, 3 = nekobt, etc.) */
    main_source: number;
    /** Nyaa.si torrent ID (0 if not from Nyaa) */
    nyaa_id: number;
    /** Sukebei torrent ID (0 if not from Sukebei) */
    sukebei_id: number;
    /** NekoBT torrent ID (0 if not from NekoBT) */
    nekobt_id: number;
    /** Full release name/title */
    name: string;
    /** BitTorrent info hash (lowercase hex) */
    btih: string;
    /** Adult content flag (0 or 1) */
    is_adult: number;
    /** Total size in bytes */
    totalsize: number;
    /** Number of files in the torrent */
    filecount: number;
    /** Audio language codes (e.g. ["ja", "en"]) */
    audiolangs: string[];
    /** Subtitle language codes */
    sublangs: string[];
    /** Episode number (null for batch/season packs) */
    episode_no: number | null;
    /** Source date timestamp (Unix seconds) */
    source_date: number;
    /** Date added to Tsukihime (Unix seconds) */
    added_date: number;
    /** Processing state */
    state: string;
    /** Anime metadata (null for uncategorized) */
    anime: TsukihimeAnime | null;
    /** Release group info (null if unknown) */
    group: TsukihimeGroup | null;
    /** Tracker statistics (present in detail responses) */
    trackers?: TsukihimeTracker[];
    /** File details (present in detail responses) */
    files?: TsukihimeFile[];
}

/** Extracted image data from a Tsukihime torrent response */
export interface TsukihimeImages {
    /** Anime cover/thumbnail URL */
    cover: string | null;
    /** Anime title for display */
    animeTitle: string | null;
    /** Anime genres */
    genres: string[];
    /** Animation studio names */
    studios: string[];
    /** Release group name */
    groupName: string | null;
    /** Screenshot URLs extracted from vidframes */
    screenshots: string[];
}
