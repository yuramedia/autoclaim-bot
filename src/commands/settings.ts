import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
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
    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();

    let user = await User.findOne({ discordId: interaction.user.id });

    if (!user) {
        await interaction.editReply({
            content: '❌ You have not set up any tokens yet. Use `/setup-hoyolab` or `/setup-endfield` first.',
        });
        return;
    }

    if (subcommand === 'notify') {
        const enabled = interaction.options.getBoolean('enabled', true);
        user.settings.notifyOnClaim = enabled;
        await user.save();

        await interaction.editReply({
            content: `✅ Notifications ${enabled ? 'enabled' : 'disabled'}. You will ${enabled ? 'now' : 'no longer'} receive DMs after claims.`,
        });
        return;
    }
}
