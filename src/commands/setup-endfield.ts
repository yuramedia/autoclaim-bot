/**
 * Setup Endfield Command
 * Open modal for SKPORT/Endfield token configuration
 * Token obtained from: https://web-api.skport.com/cookie_store/account_token
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

/**
 * Slash command data for the setup-endfield command.
 */
export const data = new SlashCommandBuilder()
    .setName("setup-endfield")
    .setDescription("Setup your SKPORT/Endfield token for auto daily claim");

/**
 * Executes the setup-endfield command to show the modal interface for token configuration.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const modal = new ModalBuilder().setCustomId("setup-endfield-modal").setTitle("Setup Endfield Token");

        const tokenInput = new TextInputBuilder()
            .setCustomId("endfield-account-token")
            .setLabel("ACCOUNT_TOKEN")
            .setPlaceholder("Login ke SKPORT lalu buka web-api.skport.com/cookie_store/account_token")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMinLength(10);

        const nicknameInput = new TextInputBuilder()
            .setCustomId("endfield-nickname")
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
        console.error("setup-endfield command failed:", error);
        try {
            await interaction.reply({
                content: "❌ Failed to open setup modal.",
                ephemeral: true
            });
        } catch (e) {
            console.error("Failed to send error reply:", e);
        }
    }
}
