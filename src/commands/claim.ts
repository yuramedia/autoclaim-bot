import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    EmbedBuilder,
} from 'discord.js';
import { User } from '../database/models/User';
import { HoyolabService, formatHoyolabResults } from '../services/hoyolab';
import { EndfieldService, formatEndfieldResult } from '../services/endfield';

export const data = new SlashCommandBuilder()
    .setName('claim')
    .setDescription('Manually claim daily rewards now')
    .addStringOption(option =>
        option
            .setName('service')
            .setDescription('Which service to claim (default: all)')
            .setRequired(false)
            .addChoices(
                { name: 'All', value: 'all' },
                { name: 'Hoyolab', value: 'hoyolab' },
                { name: 'Endfield', value: 'endfield' }
            )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const service = interaction.options.getString('service') || 'all';
    const user = await User.findOne({ discordId: interaction.user.id });

    if (!user) {
        await interaction.editReply({
            content: '❌ You have not set up any tokens yet. Use `/setup-hoyolab` or `/setup-endfield` first.',
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle('🎁 Daily Claim Results')
        .setColor(0x00AE86)
        .setTimestamp();

    let hasResults = false;

    // Claim Hoyolab
    if ((service === 'all' || service === 'hoyolab') && user.hoyolab?.token) {
        const hoyolabService = new HoyolabService(user.hoyolab.token);
        const results = await hoyolabService.claimAll(user.hoyolab.games);

        embed.addFields({
            name: '🌟 Hoyolab',
            value: formatHoyolabResults(results),
            inline: false,
        });

        user.hoyolab.lastClaim = new Date();
        user.hoyolab.lastClaimResult = results.map(r => `${r.game}: ${r.success ? '✅' : '❌'}`).join(', ');
        hasResults = true;
    }

    // Claim Endfield
    if ((service === 'all' || service === 'endfield') && user.endfield?.token) {
        const endfieldService = new EndfieldService(user.endfield.token);
        const result = await endfieldService.claim();

        embed.addFields({
            name: '🎮 Endfield',
            value: formatEndfieldResult(result),
            inline: false,
        });

        user.endfield.lastClaim = new Date();
        user.endfield.lastClaimResult = result.success ? '✅ Success' : `❌ ${result.message}`;
        hasResults = true;
    }

    if (!hasResults) {
        await interaction.editReply({
            content: `❌ No tokens configured for the selected service. Use \`/setup-hoyolab\` or \`/setup-endfield\` first.`,
        });
        return;
    }

    await user.save();
    await interaction.editReply({ embeds: [embed] });
}
