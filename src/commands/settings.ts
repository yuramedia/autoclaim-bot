import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js';
import { User } from '../database/models/User';

export const data = new SlashCommandBuilder()
    .setName('settings')
    .setDescription('Manage your auto-claim settings')
    .addSubcommand(subcommand =>
        subcommand
            .setName('notify')
            .setDescription('Toggle DM notifications after claims')
            .addBooleanOption(option =>
                option
                    .setName('enabled')
                    .setDescription('Enable or disable notifications')
                    .setRequired(true)
            )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'notify') {
        const enabled = interaction.options.getBoolean('enabled', true);

        await User.findOneAndUpdate(
            { discordId: interaction.user.id },
            {
                $set: {
                    username: interaction.user.username,
                    'settings.notifyOnClaim': enabled,
                },
            },
            { upsert: true }
        );

        await interaction.editReply({
            content: enabled
                ? '✅ DM notifications enabled. You will receive claim results via DM.'
                : '❌ DM notifications disabled. You will no longer receive claim results.',
        });
    }
}
