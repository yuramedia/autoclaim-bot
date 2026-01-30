import { ModalSubmitInteraction } from 'discord.js';
import { User } from '../database/models/User';
import { EndfieldService } from '../services/endfield';

export async function handleEndfieldModal(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    const token = interaction.fields.getTextInputValue('endfield-token').trim();
    const nickname = interaction.fields.getTextInputValue('endfield-nickname')?.trim() || 'Unknown';

    // Validate token
    const service = new EndfieldService(token);
    const validation = await service.validateToken();

    if (!validation.valid) {
        await interaction.editReply({
            content: `❌ Invalid token: ${validation.message}\n\nMake sure to copy the ACCOUNT_TOKEN value from browser DevTools:\n1. Open https://game.skport.com/endfield/sign-in\n2. Press F12 → Application → Cookies → .skport.com\n3. Find ACCOUNT_TOKEN and copy its value`,
        });
        return;
    }

    // Save to database
    await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        {
            $set: {
                username: interaction.user.username,
                endfield: {
                    token,
                    accountName: nickname,
                },
            },
            $setOnInsert: {
                settings: { notifyOnClaim: true },
            },
        },
        { upsert: true, new: true }
    );

    await interaction.editReply({
        content: `✅ **Endfield token saved successfully!**\n\n**Account**: ${nickname}\n\nYour daily rewards will be claimed automatically every day at 09:00 WIB.`,
    });
}
