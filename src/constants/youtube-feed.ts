/**
 * YouTube Feed Constants
 */

/** Polling interval for YouTube RSS feed (1 minute) */
export const YT_POLL_INTERVAL = 1 * 60 * 1000;

/** YouTube embed color (red) */
export const YT_COLOR = 0xff0000;

/** YouTube icon URL */
export const YT_ICON = "https://www.youtube.com/s/desktop/f5af92e4/img/favicon_144x144.png";

/** Base RSS feed URL for YouTube channels */
export const YT_FEED_BASE_URL = "https://www.youtube.com/feeds/videos.xml?channel_id=";

/** Maximum number of video items to cache per channel */
export const YT_MAX_ITEMS = 30;

/** Maximum number of YouTube channels allowed per guild */
export const YT_MAX_CHANNELS_PER_GUILD = 10;

/** Supported region list for YouTube feed scraping & localization */
export const YT_REGIONS = [
    { name: "Indonesia 🇮🇩", value: "ID" },
    { name: "Japan 🇯🇵", value: "JP" },
    { name: "United States 🇺🇸", value: "US" },
    { name: "Singapore 🇸🇬", value: "SG" },
    { name: "Taiwan 🇹🇼", value: "TW" },
    { name: "Hong Kong 🇭🇰", value: "HK" },
    { name: "South Korea 🇰🇷", value: "KR" },
    { name: "Global 🌐", value: "GLOBAL" }
] as const;
