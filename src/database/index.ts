/**
 * Database Module
 * Central export for MongoDB connection lifecycle, models, and repositories.
 */

// Connection & Lifecycle
export {
    connectDatabase,
    disconnectDatabase,
    isDatabaseConnected,
    ensureDatabaseConnected,
    getDatabaseHealth,
    MONGO_OPTIONS,
    MONGO_STATE_NAMES,
    type DatabaseHealth
} from "./connection";

// User Model & Repository Helpers
export {
    User,
    type IUser,
    type IHoyolabData,
    type IEndfieldData,
    getUser,
    findOrCreateUser,
    updateHoyolabCredentials,
    updateEndfieldCredentials,
    updateHoyolabGames,
    updateUserClaimResult,
    updateUserSettings,
    deleteUserData,
    deleteUser,
    removeUserService
} from "./models/user";

// Guild Settings Model, Cache & Helpers
export {
    GuildSettings,
    type IGuildSettings,
    type IEmbedFixSettings,
    type ICrunchyrollFeedSettings,
    type IU2FeedSettings,
    type IAntihackSettings,
    type IYouTubeFeedChannel,
    type IYouTubeFeedSettings,
    getGuildSettings,
    getCachedGuildSettings,
    updateEmbedFixSettings,
    updateAntihackSettings,
    updateU2FeedSettings,
    updateCrunchyrollFeedSettings,
    updateYouTubeFeedSettings,
    invalidateGuildSettingsCache
} from "./models/guild-settings";

// Claim History Model & Helpers
export {
    ClaimHistory,
    type IClaimHistory,
    type IClaimHistoryInput,
    type IClaimReward,
    recordClaimHistory,
    getUserRecentClaimHistory,
    deleteUserClaimHistory
} from "./models/claim-history";
