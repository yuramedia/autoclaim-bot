/**
 * Antihack Constants
 * Configuration constants for the antihack (trap channel) system
 */

/** Number of seconds of message history to delete when banning (7 days) */
export const ANTIHACK_BAN_DELETE_SECONDS = 7 * 24 * 60 * 60;

/** Embed color for the antihack ban log (red) */
export const ANTIHACK_EMBED_COLOR = 0xff0000;

/** Embed color for the antihack status/info embeds (blurple) */
export const ANTIHACK_INFO_EMBED_COLOR = 0x5865f2;

/** Maximum length for message content in log embeds */
export const ANTIHACK_MAX_MESSAGE_LENGTH = 1024;
