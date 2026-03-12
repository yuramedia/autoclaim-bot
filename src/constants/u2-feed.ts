/**
 * U2 Torrent Feed Constants
 */

/** Polling interval for U2 RSS feed (10 minutes) */
export const U2_POLL_INTERVAL = 10 * 60 * 1000;

/** U2 embed color (teal/cyan) */
export const U2_COLOR = 0x09a3cc;

/** U2 icon URL */
export const U2_ICON = "https://i.imgur.com/lNorPYS.png";

/** Default regex filter to match BDMV-related titles */
export const U2_DEFAULT_FILTER = "BDMV|Blu-ray|BD-BOX";

/** Image URL pattern to extract from HTML descriptions */
export const U2_IMAGE_PATTERN =
    /[(http(s)?)://(www.)?a-zA-Z0-9@:%._\-+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_+.~#?&/=]*)(.jpg|.png|.jpeg|.gif)/i;

/** U2 attachment image prefix pattern */
export const U2_ATTACH_IMAGE_PATTERN = /^attachments\/\d{6}\/.*/i;

/** U2 passkey URL pattern for replacement */
export const U2_PASSKEY_URL_PATTERN = /https?:\/\/u2\.dmhy\.org\/torrentrss\.php.*(passkey=[^& ]*).*/i;

/** Maximum number of items to cache */
export const U2_MAX_ITEMS = 50;

/** Max age for items on first run (24 hours in ms) */
export const U2_FIRST_RUN_MAX_AGE = 24 * 60 * 60 * 1000;
