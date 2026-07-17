/**
 * Anime Metadata Types
 * Types for animeApi.my.id responses
 * Reference: https://github.com/nattadasu/animeApi
 */

/**
 * AnimeApi response from animeApi.my.id
 * Contains mappings across multiple anime databases
 */
export interface AnimeApiResponse {
    /** Anime title */
    title: string;
    /** AniDB ID */
    anidb?: number | null;
    /** Anilist ID */
    anilist?: number | null;
    /** Anime News Network ID */
    animenewsnetwork?: number | null;
    /** Anime-Planet slug */
    animeplanet?: string | null;
    /** Anisearch ID */
    anisearch?: number | null;
    /** Annict ID */
    annict?: number | null;
    /** Hikka ID */
    hikka?: number | null;
    /** IMDb ID (ttXXXXXXX format) */
    imdb?: string | null;
    /** Kaize ID */
    kaize?: number | null;
    /** Kitsu ID */
    kitsu?: number | null;
    /** Letterboxd slug */
    letterboxd?: string | null;
    /** Letterboxd letter ID */
    letterboxd_letter?: string | null;
    /** Letterboxd unique ID */
    letterboxd_unique?: string | null;
    /** LiveChart ID */
    livechart?: number | null;
    /** MyAnimeList ID */
    myanimelist?: number | null;
    /** Nautiljon slug */
    nautiljon?: string | null;
    /** Notify ID */
    notify?: string | null;
    /** Otak Otaku slug */
    otakotaku?: string | null;
    /** Shikimori ID (same as MAL) */
    shikimori?: number | null;
    /** Shoboi ID */
    shoboi?: number | null;
    /** SilverYasha slug */
    silveryasha?: string | null;
    /** Simkl ID */
    simkl?: number | null;
    /** The Movie DB ID */
    themoviedb?: number | null;
    /** The Movie DB media type */
    themoviedb_mediatype?: "movie" | "tv" | null;
    /** The TVDB ID */
    thetvdb?: number | null;
    /** Trakt slug */
    trakt?: number | string | null;
    /** Trakt media type */
    trakt_mediatype?: "movies" | "shows" | null;
    /** Season number */
    season?: number | null;
    /** Season type (e.g., "TV", "Movie") */
    type?: string | null;
}

/**
 * Simplified anime metadata for internal use
 */
export interface AnimeMetadata {
    /** Anime title */
    title: string;
    /** MyAnimeList ID */
    malId?: number;
    /** Anilist ID */
    anilistId?: number;
    /** Anilist URL */
    anilistUrl?: string;
    /** MAL URL */
    malUrl?: string;
}

/**
 * @deprecated Use AnimeApiResponse instead
 * Legacy Anilist media type for backwards compatibility
 */
export interface AnilistMedia {
    id: number;
    idMal: number | null;
    siteUrl: string | null;
    title: {
        romaji: string;
        english: string | null;
        native: string | null;
    };
}

/**
 * @deprecated Use AnimeApiResponse instead
 * Legacy Anilist response type for backwards compatibility
 */
export interface AnilistResponse {
    Media: AnilistMedia;
}
