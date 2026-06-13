/**
 * Antihack Types
 * Type definitions for the antihack (trap channel) system
 */

/** Result of an antihack ban action */
export interface AntihackBanResult {
    /** Whether the ban was successfully applied */
    success: boolean;
    /** The banned user's Discord ID */
    userId: string;
    /** The banned user's tag (e.g., "User#1234") */
    userTag: string;
    /** The trap channel ID where the message was sent */
    channelId: string;
    /** The content of the offending message (truncated) */
    messageContent: string;
    /** Error message if the ban failed */
    error?: string;
}

/** Data used to build the antihack log embed */
export interface AntihackLogData {
    /** The banned user's tag */
    userTag: string;
    /** The banned user's Discord ID */
    userId: string;
    /** The banned user's avatar URL */
    avatarUrl: string;
    /** The trap channel ID */
    channelId: string;
    /** The offending message content (truncated to 1024 chars) */
    messageContent: string;
    /** The guild name */
    guildName: string;
}
