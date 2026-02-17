/**
 * Setup Endfield Command
 * Open modal for SKPORT/Endfield token configuration
 * Tokens obtained from: https://game.skport.com/endfield/sign-in
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
import { ENDFIELD } from "../constants";

export const data = new SlashCommandBuilder()
    .setName("setup-endfield")
    .setDescription("Setup your SKPORT/Endfield token for auto daily claim");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const modal = new ModalBuilder().setCustomId("setup-endfield-modal").setTitle("Setup Endfield Token");

    const credInput = new TextInputBuilder()
        .setCustomId("endfield-cred")
        .setLabel("SK_OAUTH_CRED_KEY (from Cookie)")
        .setPlaceholder("F12 > Application > Cookies > game.skport.com > SK_OAUTH_CRED_KEY")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(20);

    const tokenInput = new TextInputBuilder()
        .setCustomId("endfield-token-cache")
        .setLabel("SK_TOKEN_CACHE_KEY (from LocalStorage)")
        .setPlaceholder("F12 > Application > Local Storage > game.skport.com > SK_TOKEN_CACHE_KEY")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(10);

    const gameIdInput = new TextInputBuilder()
        .setCustomId("endfield-game-id")
        .setLabel("Game UID (number only)")
        .setPlaceholder("Your Endfield UID, example: 10012345")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(5)
        .setMaxLength(20);

    const serverInput = new TextInputBuilder()
        .setCustomId("endfield-server")
        .setLabel(`Server (2=${ENDFIELD.servers["2"]}, 3=${ENDFIELD.servers["3"]})`)
        .setPlaceholder("2")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(1);

    const nicknameInput = new TextInputBuilder()
        .setCustomId("endfield-nickname")
        .setLabel("Account Nickname (optional)")
        .setPlaceholder("Your nickname")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(50);

    const row1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(credInput);
    const row2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(tokenInput);
    const row3 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(gameIdInput);
    const row4 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(serverInput);
    const row5 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nicknameInput);

    modal.addComponents(row1, row2, row3, row4, row5);

    await interaction.showModal(modal);
}
