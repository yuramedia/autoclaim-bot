import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    type ModalActionRowComponentBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('setup-endfield')
    .setDescription('Setup your SKPORT/Endfield token for auto daily claim');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId('setup-endfield-modal')
        .setTitle('Setup Endfield Token');

    const tokenInput = new TextInputBuilder()
        .setCustomId('endfield-token')
        .setLabel('ACCOUNT_TOKEN')
        .setPlaceholder('Copy from browser DevTools > Cookies > .skport.com > ACCOUNT_TOKEN')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(20);

    const nicknameInput = new TextInputBuilder()
        .setCustomId('endfield-nickname')
        .setLabel('Account Nickname (optional)')
        .setPlaceholder('Your nickname')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(50);

    const row1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(tokenInput);
    const row2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nicknameInput);

    modal.addComponents(row1, row2);

    await interaction.showModal(modal);
}
