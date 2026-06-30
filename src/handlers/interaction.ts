/**
 * Interaction handler for Discord.js
 * Handles commands, modals, and select menus
 */

import {
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    type Interaction,
    Collection,
    StringSelectMenuInteraction
} from "discord.js";
import { commands } from "../commands";
import { handleHoyolabModal } from "./hoyolab-modal";
import { handleEndfieldModal } from "./endfield-modal";
import { handleHoyolabSelect } from "./hoyolab-select";
import { handleResolutionSelect } from "./resolution-select";
import { handleInteractionError } from "../utils/error-handler";
import { logger } from "../core/logger";

// Store commands in collection for fast lookup
const commandCollection = new Collection<string, (typeof commands)[0]>();
for (const command of commands) {
    commandCollection.set(command.data.name, command);
}

/**
 * Main interaction handler.
 * Routes incoming Discord interactions to their respective sub-handlers (commands, autocomplete, modals, select menus).
 * @param interaction - The incoming Discord interaction
 * @returns A promise that resolves when routing is complete
 */
export async function handleInteraction(interaction: Interaction): Promise<void> {
    try {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
            return;
        }

        // Handle autocomplete
        if (interaction.isAutocomplete()) {
            await handleAutocomplete(interaction);
            return;
        }

        // Handle modal submissions
        if (interaction.isModalSubmit()) {
            await handleModal(interaction);
            return;
        }

        // Handle select menus
        if (interaction.isStringSelectMenu()) {
            await handleSelectMenu(interaction);
            return;
        }
    } catch (error: unknown) {
        logger.error(error, "[handleInteraction] Unexpected interaction handling error");
    }
}

/**
 * Handle slash command interactions
 */
async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = commandCollection.get(interaction.commandName);

    if (!command) {
        logger.error(`[Command] ${interaction.commandName} not found`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error: unknown) {
        await handleInteractionError(interaction, error, "❌ An error occurred while executing this command.");
    }
}

/**
 * Handle modal submission interactions
 */
async function handleModal(interaction: Interaction): Promise<void> {
    if (!interaction.isModalSubmit()) return;

    try {
        switch (interaction.customId) {
            case "setup-hoyolab-modal":
                await handleHoyolabModal(interaction);
                break;
            case "setup-endfield-modal":
                await handleEndfieldModal(interaction);
                break;
            default:
                logger.warn(`[Modal] Unknown modal: ${interaction.customId}`);
        }
    } catch (error: unknown) {
        await handleInteractionError(interaction, error, "❌ An error occurred while processing your input.");
    }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        if (interaction.customId.startsWith("res_select|")) {
            await handleResolutionSelect(interaction);
            return;
        }

        switch (interaction.customId) {
            case "hoyolab-games-select":
                await handleHoyolabSelect(interaction);
                break;
            default:
                logger.warn(`[SelectMenu] Unknown select menu: ${interaction.customId}`);
        }
    } catch (error: unknown) {
        await handleInteractionError(interaction, error, "❌ Error processing selection.");
    }
}

/**
 * Handle autocomplete interactions
 */
async function handleAutocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const command = commandCollection.get(interaction.commandName) as (typeof commands)[0] & {
        autocomplete?: (interaction: AutocompleteInteraction) => Promise<void>;
    };

    if (!command?.autocomplete) return;

    try {
        await command.autocomplete(interaction);
    } catch (error: unknown) {
        logger.error(error, `[Autocomplete] Error for ${interaction.commandName}`);
    }
}
