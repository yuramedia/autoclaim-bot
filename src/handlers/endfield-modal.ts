/**
 * Endfield Modal Handler
 * Handles the modal submission for Endfield token setup
 * Saves ACCOUNT_TOKEN to database
 */

import { type ModalSubmitInteraction, MessageFlags } from "discord.js";
import { User } from "../database/models/user";
import { EndfieldService } from "../services/endfield";
import { encryptToken } from "../utils/token-crypto";

export async function handleEndfieldModal(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const accountToken = interaction.fields.getTextInputValue("endfield-account-token").trim();
    const nickname = interaction.fields.getTextInputValue("endfield-nickname")?.trim() || "Unknown";

    // Validate token
    const validation = EndfieldService.validateParams(accountToken);
    if (!validation.valid) {
        await interaction.editReply({
            content: validation.message || "❌ Invalid parameters."
        });
        return;
    }

    // Save to database — encrypt token before storage
    await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        {
            $set: {
                username: interaction.user.username,
                endfield: {
                    accountToken: encryptToken(accountToken),
                    accountName: nickname
                }
            },
            $setOnInsert: {
                settings: { notifyOnClaim: true }
            }
        },
        { upsert: true, new: true }
    );

    await interaction.editReply({
        content:
            `✅ **Endfield token saved!**\n\n` +
            `**Account**: ${nickname}\n\n` +
            `UID dan server akan otomatis terdeteksi saat claim.\n` +
            `⚠️ Gunakan \`/claim endfield\` untuk test apakah token berfungsi.`
    });
}
