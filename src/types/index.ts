/**
 * Types barrel export
 * Central export point for all type definitions
 */

// Hoyolab types
export type { ClaimResult, GameConfig, GameAccount, TokenValidation, RedeemResult } from "./hoyolab";

// Endfield types
export type {
    AttendanceReward,
    AttendanceResourceInfo,
    EndfieldClaimResult,
    EndfieldServiceOptions,
    EndfieldValidation
} from "./endfield";

// Crunchyroll types
export type {
    CrunchyrollAuth,
    CrunchyrollEpisode,
    CrunchyrollEpisodes,
    FormattedEpisode,
    CrunchyrollSubtitle,
    CrunchyrollPlayResponse
} from "./crunchyroll";

// Code source types
export type { RedeemCode, HashblenResponse } from "./code-source";

// Embed types
export type { PostAuthor, PostStats, PostInfo } from "./embed";

// Embed Fix types
export { PlatformId } from "./embed-fix";
export type { PlatformConfig, ProcessedUrl } from "./embed-fix";

// Media Downloader types
export type { VKRResponse, VKRFormat, DownloadResult } from "./media-downloader";

// Common types
export type { InteractionHandler, ApiResponse, UserSettings, HoyolabGames } from "./common";

// Best Release types
export type { AnimeRelease, AnimeEntry } from "./bestrelease";

// Anime Metadata types
export type { AnilistMedia, AnilistResponse } from "./anime-metadata";

// Jisho types
export type { JishoResult, JishoAPIResponse, JishoWord } from "./jisho";
