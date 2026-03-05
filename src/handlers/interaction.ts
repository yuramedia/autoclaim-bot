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
import { handleInteractionError } from "../utils/error-handler";

// Store commands in collection for fast lookup
const commandCollection = new Collection<string, (typeof commands)[0]>();
for (const command of commands) {
    commandCollection.set(command.data.name, command);
}

/**
 * Main interaction handler
 * Routes interactions to appropriate handlers
 */
export async function handleInteraction(interaction: Interaction): Promise<void> {
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
}

/**
 * Handle slash command interactions
 */
async function handleCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const command = commandCollection.get(interaction.commandName);

    if (!command) {
        console.error(`[Command] ${interaction.commandName} not found`);
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
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
                console.warn(`[Modal] Unknown modal: ${interaction.customId}`);
        }
    } catch (error) {
        await handleInteractionError(interaction, error, "❌ An error occurred while processing your input.");
    }
}

/**
 * Handle select menu interactions
 */
async function handleSelectMenu(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        switch (interaction.customId) {
            case "hoyolab-games-select":
                await handleHoyolabSelect(interaction);
                break;
            default:
                console.warn(`[SelectMenu] Unknown select menu: ${interaction.customId}`);
        }
    } catch (error) {
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
    } catch (error) {
        console.error(`[Autocomplete] Error for ${interaction.commandName}:`, error);
    }
}
