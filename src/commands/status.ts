import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
} from 'discord.js';
import { User } from '../database/models/User';

export const data = new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check your auto-claim status');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = await User.findOne({ discordId: interaction.user.id });

    if (!user) {
        await interaction.editReply({
            content: '❌ You have not set up any tokens yet. Use `/setup-hoyolab` or `/setup-endfield` to get started.',
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('📊 Auto-Claim Status')
        .setColor(0x5865F2)
        .setTimestamp()
        .setFooter({ text: `Requested by ${interaction.user.username}` });

    // Hoyolab status
    if (user.hoyolab?.token) {
        const gameNames: Record<string, string> = {
            genshin: 'Genshin Impact',
            starRail: 'Honkai: Star Rail',
            honkai3: 'Honkai Impact 3rd',
            tearsOfThemis: 'Tears of Themis',
            zenlessZoneZero: 'Zenless Zone Zero',
        };

        const enabledGames = user.hoyolab.games
            ? Object.entries(user.hoyolab.games)
                .filter(([_, enabled]) => enabled)
                .map(([key]) => gameNames[key] || key)
                .join(', ') || 'None'
            : 'None';

        const lastClaim = user.hoyolab.lastClaim
            ? `<t:${Math.floor(user.hoyolab.lastClaim.getTime() / 1000)}:R>`
            : 'Never';

        embed.addFields({
            name: '🌟 Hoyolab',
            value: [
                `**Account:** ${user.hoyolab.accountName || 'Unknown'}`,
                `**Games:** ${enabledGames}`,
                `**Last Claim:** ${lastClaim}`,
                `**Result:** ${user.hoyolab.lastClaimResult || 'N/A'}`,
            ].join('\n'),
            inline: false,
        });
    } else {
        embed.addFields({
            name: '🌟 Hoyolab',
            value: '❌ Not configured',
            inline: false,
        });
    }

    // Endfield status
    if (user.endfield?.token) {
        const lastClaim = user.endfield.lastClaim
            ? `<t:${Math.floor(user.endfield.lastClaim.getTime() / 1000)}:R>`
            : 'Never';

        embed.addFields({
            name: '🎮 Endfield',
            value: [
                `**Account:** ${user.endfield.accountName || 'Unknown'}`,
                `**Last Claim:** ${lastClaim}`,
                `**Result:** ${user.endfield.lastClaimResult || 'N/A'}`,
            ].join('\n'),
            inline: false,
        });
    } else {
        embed.addFields({
            name: '🎮 Endfield',
            value: '❌ Not configured',
            inline: false,
        });
    }

    // Settings
    embed.addFields({
        name: '⚙️ Settings',
        value: `**Notify on Claim:** ${user.settings?.notifyOnClaim ? '✅ Enabled' : '❌ Disabled'}`,
        inline: false,
    });

    await interaction.editReply({ embeds: [embed] });
}
