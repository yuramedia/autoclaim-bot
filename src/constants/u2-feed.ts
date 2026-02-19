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
    /(?:https?:)?\/\/[a-zA-Z0-9@:%._+~#=-]{2,256}\.[a-z]{2,6}\b[-a-zA-Z0-9@:%_+.~#?&/=]*\.(?:jpg|jpeg|png|gif|webp)/i;

/** U2 attachment image prefix pattern */
export const U2_ATTACH_IMAGE_PATTERN = /^attachments\/\d{6}\/.*/i;
