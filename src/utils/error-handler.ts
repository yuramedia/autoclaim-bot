/**
 * Unified error handling utilities for Discord interactions
 */

import { type Interaction, MessageFlags } from "discord.js";
import { logger } from "../core/logger";

/**
 * Handle interaction errors uniformly
 * Sends appropriate error response based on interaction state
 */
export async function handleInteractionError(
    interaction: Interaction,
    error: unknown,
    customMessage?: string
): Promise<void> {
    const message = customMessage || "❌ An error occurred while processing your request.";

    logger.error(error, `[Error] Interaction ${interaction.id}`);

    if (!interaction.isRepliable()) return;

    try {
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({
                content: message,
                flags: MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({
                content: message,
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (sendError) {
        logger.error(sendError, "[Error] Failed to send error response");
    }
}

/**
 * Safe wrapper for async interaction handlers
 * Catches errors and sends appropriate responses
 */
export function withErrorHandler<T extends Interaction>(
    handler: (interaction: T) => Promise<void>,
    errorMessage?: string
): (interaction: T) => Promise<void> {
    return async (interaction: T) => {
        try {
            await handler(interaction);
        } catch (error) {
            await handleInteractionError(interaction, error, errorMessage);
        }
    };
}

/**
 * Format error for logging
 */
export function formatError(error: unknown): string {
    if (error instanceof Error) {
        return `${error.name}: ${error.message}`;
    }
    return String(error);
}
