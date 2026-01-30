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
    .setName('setup-hoyolab')
    .setDescription('Setup your Hoyolab token for auto daily claim');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const modal = new ModalBuilder()
        .setCustomId('setup-hoyolab-modal')
        .setTitle('Setup Hoyolab Token');

    const tokenInput = new TextInputBuilder()
        .setCustomId('hoyolab-token')
        .setLabel('Hoyolab Token')
        .setPlaceholder('ltoken_v2=xxx; ltuid_v2=xxx')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMinLength(20);

    const nicknameInput = new TextInputBuilder()
        .setCustomId('hoyolab-nickname')
        .setLabel('Account Nickname (optional)')
        .setPlaceholder('Your nickname')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(50);

    const gamesInput = new TextInputBuilder()
        .setCustomId('hoyolab-games')
        .setLabel('Games (comma-separated)')
        .setPlaceholder('genshin, starrail, zzz, honkai3, tot')
        .setValue('genshin, starrail, zzz')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

    const row1 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(tokenInput);
    const row2 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(nicknameInput);
    const row3 = new ActionRowBuilder<ModalActionRowComponentBuilder>().addComponents(gamesInput);

    modal.addComponents(row1, row2, row3);

    await interaction.showModal(modal);
}
