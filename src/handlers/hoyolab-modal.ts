import { type ModalSubmitInteraction, MessageFlags, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ActionRowBuilder } from 'discord.js';
import { User } from '../database/models/User';
import { HoyolabService } from '../services/hoyolab';

export async function handleHoyolabModal(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // Sanitize token: remove newlines, carriage returns, and quotes
    const token = interaction.fields.getTextInputValue('hoyolab-token')
        .trim()
        .replace(/[\r\n"]+/g, '');

    const nickname = interaction.fields.getTextInputValue('hoyolab-nickname')?.trim() || 'Unknown';

    // Validate token quality
    const hasLToken = token.includes('ltoken') || token.includes('ltoken_v2');
    const hasCookieToken = token.includes('cookie_token') || token.includes('cookie_token_v2');
    const hasAccountId = token.includes('account_id') || token.includes('account_id_v2');

    let warningMsg = '';
    if (!hasLToken) {
        warningMsg += '\n⚠️ **Critical:** `ltoken` is missing. Daily check-in might fail.';
    }
    if (!hasCookieToken) {
        warningMsg += '\n⚠️ **Warning:** `cookie_token` is missing. `/redeem` will FAIL.';
    } else if (!hasAccountId) {
        warningMsg += '\n⚠️ **Warning:** `account_id` is missing. `/redeem` requires it matching `cookie_token`.';
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

    // Save to database (partial update)
    await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        {
            $set: {
                username: interaction.user.username,
                'hoyolab.token': token,
                'hoyolab.accountName': nickname,
                // We default games to all false initially, user will select them next
                'hoyolab.games': {
                    genshin: false,
                    starRail: false,
                    honkai3: false,
                    tearsOfThemis: false,
                    zenlessZoneZero: false,
                }
            },
            $setOnInsert: {
                settings: { notifyOnClaim: true },
            },
        },
        { upsert: true, new: true }
    );

    // Create Select Menu
    const select = new StringSelectMenuBuilder()
        .setCustomId('hoyolab-games-select')
        .setPlaceholder('Select games to auto-claim')
        .setMinValues(1)
        .setMaxValues(5)
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('Genshin Impact')
                .setValue('genshin')
                .setEmoji('✨'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Honkai: Star Rail')
                .setValue('starRail')
                .setEmoji('🚂'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Zenless Zone Zero')
                .setValue('zenlessZoneZero')
                .setEmoji('💤'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Honkai Impact 3rd')
                .setValue('honkai3')
                .setEmoji('☄️'),
            new StringSelectMenuOptionBuilder()
                .setLabel('Tears of Themis')
                .setValue('tearsOfThemis')
                .setEmoji('⚖️'),
        );

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

    await interaction.editReply({
        content: `✅ Hoyolab token saved for **${nickname}**!${warningMsg}\n⬇️ **Now, please select your games below:**`,
        components: [row],
    });
}
