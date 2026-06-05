/**
 * Anime Metadata Types
 * for Anilist and other metadata services
 */

/**
 * Represents Anilist media metadata.
 */
export interface AnilistMedia {
    /** The Anilist ID of the media. */
    id: number;
    /** The MyAnimeList ID of the media, or null if not available. */
    idMal: number | null;
    /** The website URL of the Anilist media page, or null if not available. */
    siteUrl: string | null;
    /** Titles of the media in different languages/formats. */
    title: {
        /** Romaji title. */
        romaji: string;
        /** English title, or null. */
        english: string | null;
        /** Native/Japanese title, or null. */
        native: string | null;
    };
}

/**
 * Response format for Anilist GraphQL Media query.
 */
export interface AnilistResponse {
    /** The media object returned by the API. */
    Media: AnilistMedia;
}
