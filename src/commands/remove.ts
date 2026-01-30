import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js';
import { User } from '../database/models/User';

export const data = new SlashCommandBuilder()
    .setName('remove')
    .setDescription('Remove your tokens from the database')
    .addStringOption(option =>
        option
            .setName('service')
            .setDescription('Which service to remove')
            .setRequired(true)
            .addChoices(
                { name: 'All', value: 'all' },
                { name: 'Hoyolab', value: 'hoyolab' },
                { name: 'Endfield', value: 'endfield' }
            )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const service = interaction.options.getString('service', true);
    const user = await User.findOne({ discordId: interaction.user.id });

    if (!user) {
        await interaction.editReply({
            content: '❌ You have no tokens stored.',
        });
        return;
    }

    if (service === 'all') {
        await User.deleteOne({ discordId: interaction.user.id });
        await interaction.editReply({
            content: '✅ All your data has been removed.',
        });
    } else if (service === 'hoyolab') {
        user.hoyolab = undefined;
        await user.save();
        await interaction.editReply({
            content: '✅ Your Hoyolab token has been removed.',
        });
    } else if (service === 'endfield') {
        user.endfield = undefined;
        await user.save();
        await interaction.editReply({
            content: '✅ Your Endfield token has been removed.',
        });
    }
}
