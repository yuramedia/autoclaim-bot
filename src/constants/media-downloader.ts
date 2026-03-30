/**
 * Media Downloader Constants
 * Configuration for media downloading service
 */

/** VKrDownloader API Base URL */
export const VKRDOWNLOADER_API = "https://vkrdownloader.org/server/";

/** API Key for VKrDownloader */
export const VKRDOWNLOADER_API_KEY = "vkrdownloader";

/** Maximum file size for downloads (Legacy default 10 MB) */
export const DEFAULT_MAX_DOWNLOAD_SIZE = 10 * 1024 * 1024;

/**
 * Get maximum upload size based on Discord Server Premium Tier
 * Tier 0 (None) & 1: 10 MB
 * Tier 2: 50 MB
 * Tier 3: 100 MB
 * @param tier Guild Premium Tier (0-3)
 */
export function getMaxDownloadSize(tier: number = 0): number {
    switch (tier) {
        case 3: // GuildPremiumTier.Tier3
            return 100 * 1024 * 1024; // 100 MB
        case 2: // GuildPremiumTier.Tier2
            return 50 * 1024 * 1024; // 50 MB
        case 1: // GuildPremiumTier.Tier1
        case 0: // GuildPremiumTier.None
        default:
            return 10 * 1024 * 1024; // 10 MB
    }
}
