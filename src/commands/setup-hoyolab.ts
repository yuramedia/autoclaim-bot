/**
 * Setup Hoyolab Command
 * Open modal for Hoyolab token configuration
 */

import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    type ModalActionRowComponentBuilder
} from "discord.js";
import { logger } from "../core/logger";

/**
 * Slash command data for the setup-hoyolab command.
 */
export const data = new SlashCommandBuilder()
    .setName("setup-hoyolab")
    .setDescription("Setup your Hoyolab token for auto daily claim");

/**
 * Executes the setup-hoyolab command to show the modal interface for Hoyolab token configuration.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const modal = new ModalBuilder().setCustomId("setup-hoyolab-modal").setTitle("Setup Hoyolab Token");

        const tokenInput = new TextInputBuilder()
            .setCustomId("hoyolab-token")
            .setLabel("Token (ltoken, ltuid, cookie_token...)")
            .setPlaceholder("ltoken_v2=...; ltuid_v2=...; cookie_token_v2=...; account_id_v2=...;")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(20);

        const nicknameInput = new TextInputBuilder()
            .setCustomId("hoyolab-nickname")
            .setLabel("Account Nickname (optional)")
            .setPlaceholder("Your nickname")
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(50);

        const row1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(tokenInput);
        const row2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nicknameInput);

        modal.addComponents(row1, row2);

        await interaction.showModal(modal);
    } catch (error) {
        logger.error(error, "setup-hoyolab command failed");
        try {
            await interaction.reply({
                content: "❌ Failed to open setup modal.",
                ephemeral: true
            });
        } catch (e) {
            logger.error(e, "Failed to send error reply");
        }
    }
}
