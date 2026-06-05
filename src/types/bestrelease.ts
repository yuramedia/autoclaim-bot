/**
 * Best Release Types
 * Type definitions for the Best Release command
 */

/**
 * Represents an anime release entry.
 */
export interface AnimeRelease {
    /** Unique ID of the release. */
    id: number;
    /** Name/title of the release. */
    name: string;
    /** ID of the associated anime entry. */
    anime_id: number;
    /** Creation timestamp of the release. */
    created_at: string;
    /** Description of the release, or null. */
    description: string | null;
    /** List of download URLs for the release, or null. */
    download_links: string[] | null;
}

/**
 * Represents a complete anime entry containing its releases and metadata.
 */
export interface AnimeEntry {
    /** Unique ID of the entry. */
    id: number;
    /** MyAnimeList ID of the anime. */
    mal_id: number;
    /** Main title of the anime. */
    title: string;
    /** English title of the anime, or null. */
    title_english: string | null;
    /** Japanese title of the anime, or null. */
    title_japanese: string | null;
    /** URL of the cover image. */
    image_url: string;
    /** Notes about the entry, or null. */
    notes: string | null;
    /** Creation timestamp. */
    created_at: string;
    /** Modification timestamp. */
    updated_at: string;
    /** List of releases associated with the anime. */
    releases: AnimeRelease[];
    /** Alternative release formats or versions. */
    alternatives: unknown[];
    /** Unmuxed releases. */
    unmuxed: unknown[];
    /** Comparisons between different releases. */
    comparisons: unknown[];
}
