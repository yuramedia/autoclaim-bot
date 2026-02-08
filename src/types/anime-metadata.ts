/**
 * Anime Metadata Types
 * for Anilist and other metadata services
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

export interface AnilistResponse {
    Media: AnilistMedia;
}
