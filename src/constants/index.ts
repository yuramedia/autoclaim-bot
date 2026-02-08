/**
 * Constants barrel export
 * Central export point for all constants
 */

export * from "./games";
export * from "./hoyolab";
export * from "./endfield";
export * from "./embed-fix";
export * from "./media-downloader";
export * from "./crunchyroll";
export * from "./languages";
export * from "./anime";

export const CHANNELS = {
    // Channel IDs will be loaded from env or config
    // For now, we keep them flexible
};

export const ROLES = {
    // Role IDs
};

export const EMOJIS = {
    // Common emojis
    SUCCESS: "✅",
    ERROR: "❌",
    loading: "⏳"
};

export const COLORS = {
    SUCCESS: 0x00ff00,
    ERROR: 0xff0000,
    WARNING: 0xffff00,
    INFO: 0x0099ff
};
