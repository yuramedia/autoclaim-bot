/**
 * Crunchyroll API Types
 */

/**
 * Authentication tokens and metadata for Crunchyroll API.
 */
export interface CrunchyrollAuth {
    /** Access token. */
    access_token: string;
    /** Refresh token. */
    refresh_token: string;
    /** Expiration time in seconds. */
    expires_in: number;
    /** Type of token, e.g. Bearer. */
    token_type: string;
    /** Scope of permissions. */
    scope: string;
    /** Country code of the user. */
    country: string;
    /** Crunchyroll account ID. */
    account_id: string;
    /** Profile ID. */
    profile_id: string;
}

/**
 * Represents an episode object from Crunchyroll API.
 */
export interface CrunchyrollEpisode {
    /** URL slug for the episode. */
    slug: string;
    /** Last public timestamp. */
    last_public: string;
    /** Link to streams. */
    streams_link: string;
    /** Images associated with the episode. */
    images: {
        /** Thumbnail images of the episode. */
        thumbnail: {
            /** Height in pixels. */
            height: number;
            /** Image URL source. */
            source: string;
            /** Type of image. */
            type: string;
            /** Width in pixels. */
            width: number;
        }[][];
    };
    /** Promotion title. */
    promo_title: string;
    /** Key for the linked resource. */
    linked_resource_key: string;
    /** Episode description. */
    description: string;
    /** External identifier. */
    external_id: string;
    /** Promotion description. */
    promo_description: string;
    /** Channel identifier. */
    channel_id: string;
    /** Unique episode identifier. */
    id: string;
    /** Episode title. */
    title: string;
    /** Type of content, e.g. episode. */
    type: string;
    /** Indicates if it is a new episode. */
    new: boolean;
    /** Metadata of the episode. */
    episode_metadata: {
        /** Locale of the audio. */
        audio_locale: string;
        /** Availability end timestamp. */
        availability_ends: string;
        /** Availability notes. */
        availability_notes: string;
        /** Availability start timestamp. */
        availability_starts: string;
        /** Current availability status. */
        availability_status: string;
        /** Available date, or null. */
        available_date: string | null;
        /** Indicates if available for offline viewing. */
        available_offline: boolean;
        /** Indicates if closed captions are available. */
        closed_captions_available: boolean;
        /** Content descriptor list. */
        content_descriptors: string[];
        /** Duration in milliseconds. */
        duration_ms: number;
        /** Eligible region codes. */
        eligible_region: string;
        /** Episode number string representation. */
        episode: string;
        /** Air date of the episode. */
        episode_air_date: string;
        /** Numeric episode number. */
        episode_number: number;
        /** Extended maturity rating details. */
        extended_maturity_rating: {
            /** Rating level. */
            level: string;
            /** Rating value. */
            rating: string;
            /** Rating system. */
            system: string;
        };
        /** Free availability start timestamp. */
        free_available_date: string;
        /** Unique identifier string. */
        identifier: string;
        /** Indicates if the episode is a clip. */
        is_clip: boolean;
        /** Indicates if the episode is dubbed. */
        is_dubbed: boolean;
        /** Indicates if the content is mature. */
        is_mature: boolean;
        /** Indicates if the episode is premium-only. */
        is_premium_only: boolean;
        /** Indicates if the episode has subtitles. */
        is_subbed: boolean;
        /** Indicates if mature content is blocked. */
        mature_blocked: boolean;
        /** Maturity ratings. */
        maturity_ratings: string[];
        /** Premium availability start timestamp. */
        premium_available_date: string;
        /** Premium date, or null. */
        premium_date: string | null;
        /** Display number of the season. */
        season_display_number: string;
        /** Season identifier. */
        season_id: string;
        /** Season number. */
        season_number: number;
        /** Season sequence number. */
        season_sequence_number: number;
        /** Slug title of the season. */
        season_slug_title: string;
        /** Title of the season. */
        season_title: string;
        /** Sequence number of the episode. */
        sequence_number: number;
        /** Series identifier. */
        series_id: string;
        /** Slug title of the series. */
        series_slug_title: string;
        /** Title of the series. */
        series_title: string;
        /** Locales of available subtitles. */
        subtitle_locales: string[];
        /** Upload date of the episode. */
        upload_date: string;
        /** Available versions of the episode. */
        versions: {
            /** Locale of the audio. */
            audio_locale: string;
            /** Unique GUID. */
            guid: string;
            /** Indicates if premium-only. */
            is_premium_only: boolean;
            /** GUID of the media. */
            media_guid: string;
            /** Indicates if it is the original version. */
            original: boolean;
            /** GUID of the season. */
            season_guid: string;
            /** Variant identifier. */
            variant: string;
        }[];
    };
    /** Slug title of the episode. */
    slug_title: string;
    /** Optional episode number as a string. */
    episode?: string;
    /** Optional episode number as a number. */
    episode_number?: number;
    /** Optional subtitle locales directly on episode (CMS v2 API). */
    subtitle_locales?: string[];
    /** Optional series title directly on episode (CMS v2 API). */
    series_title?: string;
    /** Optional season title directly on episode (CMS v2 API). */
    season_title?: string;
}

/**
 * List of Crunchyroll episodes with total count.
 */
export interface CrunchyrollEpisodes {
    /** Total number of episodes. */
    total: number;
    /** Data containing Crunchyroll episodes. */
    data: CrunchyrollEpisode[];
}

/**
 * Formatted episode representation used within the application.
 */
export interface FormattedEpisode {
    /** Unique ID. */
    id: string;
    /** Episode title. */
    title: string;
    /** Direct URL of the episode. */
    url: string;
    /** Description of the episode. */
    description: string;
    /** Thumbnail image URL. */
    thumbnail: string;
    /** Episode ID. */
    episodeId: string;
    /** Season ID. */
    seasonId: string;
    /** Series ID. */
    seriesId: string;
    /** Series title. */
    seriesTitle: string;
    /** Season title. */
    seasonTitle: string;
    /** Display episode number. */
    episodeNumber: string;
    /** Formatted duration string. */
    duration: string;
    /** Indicates if it is a dub. */
    isDub: boolean;
    /** Audio locale. */
    audioLocale: string;
    /** Formatted subtitles list. */
    subtitles: string;
    /** Release date/time. */
    releasedAt: Date;
    /** Optional publisher name. */
    publisher?: string;
    /** Optional series poster URL. */
    seriesPoster?: string;
    /** Optional external links (e.g. Anilist, MyAnimeList). */
    externalLinks?: {
        /** Anilist link. */
        anilist?: string;
        /** MyAnimeList link. */
        mal?: string;
    };
}

/**
 * Subtitle entry from cr-play-service.
 */
export interface CrunchyrollSubtitle {
    /** Locale of the subtitle. */
    locale: string;
    /** URL to fetch the subtitle. */
    url: string;
    /** Format of the subtitle file. */
    format: string;
}

/**
 * Response shape from cr-play-service play endpoint.
 */
export interface CrunchyrollPlayResponse {
    /** Subtitle tracks mapped by locale. */
    subtitles: Record<string, CrunchyrollSubtitle>;
    /** Additional index signatures. */
    [key: string]: unknown;
}

/**
 * A single series item from the Browse API (seasonal_tag queries).
 */
export interface CrunchyrollBrowseItem {
    /** Unique series ID. */
    id: string;
    /** Series title. */
    title: string;
    /** URL slug. */
    slug_title: string;
    /** Series description. */
    description: string;
    /** Media type (e.g. series). */
    type: string;
    /** Images associated with the series. */
    images: {
        /** Tall poster images. */
        poster_tall?: { height: number; width: number; source: string; type: string }[][];
        /** Wide poster images. */
        poster_wide?: { height: number; width: number; source: string; type: string }[][];
    };
    /** Metadata of the series. */
    series_metadata?: {
        /** List of audio locales. */
        audio_locales: string[];
        /** List of subtitle locales. */
        subtitle_locales: string[];
        /** Series launch year. */
        series_launch_year: number;
        /** Season tags. */
        season_tags: string[];
        /** Number of episodes. */
        episode_count: number;
        /** Indicates if it is a simulcast. */
        is_simulcast: boolean;
    };
    /** Last public release date/time. */
    last_public: string;
    /** Indicates if the series is new. */
    new: boolean;
}

/**
 * Response from the Browse API.
 */
export interface CrunchyrollBrowseResponse {
    /** Total number of series items. */
    total: number;
    /** List of browse items. */
    data: CrunchyrollBrowseItem[];
}

/**
 * Represents a seasonal lineup announcement parsed from Crunchyroll news feed.
 */
export interface LineupAnnouncement {
    title: string;
    url: string;
    description: string;
    thumbnail: string | null;
    author: string | null;
    pubDate: string;
}
