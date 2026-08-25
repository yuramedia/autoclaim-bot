/**
 * Antihack Handler
 * Intercepts messages to check for trap channel activity.
 * Should be called early in the message handler pipeline so
 * we can short-circuit before other processing (e.g., embed fix).
 */

import type { Message } from "discord.js";
import { handleAntihackMessage } from "../services/antihack";
import type { IGuildSettings } from "../database/models/guild-settings";

/**
 * Checks if the message was sent in a trap channel and handles the ban.
 * Returns true if the message was handled (user banned), signaling the
 * caller to stop further message processing.
 * @param message - The incoming Discord message
 * @param settings - Optional guild settings already fetched by the caller,
 *   avoiding a duplicate DB read on the per-message hot path.
 * @returns True if the antihack system handled this message
 */
export async function checkAntihack(message: Message, settings?: IGuildSettings): Promise<boolean> {
    const result = await handleAntihackMessage(message, settings);
    // Only suppress further processing when ban actually succeeded.
    // Failed bans (insufficient permissions, guild owner, etc.) should NOT
    // block embed-fix processing — the user wasn't banned.
    return result !== null && result.success;
}
