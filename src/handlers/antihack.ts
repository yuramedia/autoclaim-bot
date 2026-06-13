/**
 * Antihack Handler
 * Intercepts messages to check for trap channel activity.
 * Should be called early in the message handler pipeline so
 * we can short-circuit before other processing (e.g., embed fix).
 */

import type { Message } from "discord.js";
import { handleAntihackMessage } from "../services/antihack";

/**
 * Checks if the message was sent in a trap channel and handles the ban.
 * Returns true if the message was handled (user banned), signaling the
 * caller to stop further message processing.
 * @param message - The incoming Discord message
 * @returns True if the antihack system handled this message
 */
export async function checkAntihack(message: Message): Promise<boolean> {
    const result = await handleAntihackMessage(message);
    return result !== null;
}
