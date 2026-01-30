import { ModalSubmitInteraction } from 'discord.js';
import { User } from '../database/models/User';
import { HoyolabService } from '../services/hoyolab';

export async function handleHoyolabModal(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const token = interaction.fields.getTextInputValue('hoyolab-token').trim();
    const nickname = interaction.fields.getTextInputValue('hoyolab-nickname')?.trim() || 'Unknown';
    const gamesInput = interaction.fields.getTextInputValue('hoyolab-games')?.trim() || 'genshin, starrail, zzz';

    // Parse games
    const gameAliases: Record<string, string> = {
        'genshin': 'genshin',
        'gi': 'genshin',
        'starrail': 'starRail',
        'hsr': 'starRail',
        'sr': 'starRail',
        'honkai3': 'honkai3',
        'hi3': 'honkai3',
        'tot': 'tearsOfThemis',
        'themis': 'tearsOfThemis',
        'zzz': 'zenlessZoneZero',
        'zenless': 'zenlessZoneZero',
    };

    const games = {
        genshin: false,
        starRail: false,
        honkai3: false,
        tearsOfThemis: false,
        zenlessZoneZero: false,
    };

    const inputGames = gamesInput.toLowerCase().split(',').map(g => g.trim());
    for (const game of inputGames) {
        const key = gameAliases[game];
        if (key && key in games) {
            (games as any)[key] = true;
        }
    }

    // Validate token
    const service = new HoyolabService(token);
    const validation = await service.validateToken();

    if (!validation.valid) {
        await interaction.editReply({
            content: `❌ Invalid token: ${validation.message}\n\nMake sure to copy the full cookie including \`ltoken_v2\` and \`ltuid_v2\`.`,
        });
        return;
    }

    // Save to database
    await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        {
            $set: {
                username: interaction.user.username,
                hoyolab: {
                    token,
                    accountName: nickname,
                    games,
                },
            },
            $setOnInsert: {
                settings: { notifyOnClaim: true },
            },
        },
        { upsert: true, new: true }
    );

    const enabledGames = Object.entries(games)
        .filter(([_, enabled]) => enabled)
        .map(([key, _]) => key)
        .join(', ');

    await interaction.editReply({
        content: `✅ **Hoyolab token saved successfully!**\n\n**Account**: ${nickname}\n**Games**: ${enabledGames || 'None'}\n\nYour daily rewards will be claimed automatically every day at 09:00 WIB.`,
    });
}
