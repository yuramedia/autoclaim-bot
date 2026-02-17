/**
 * Endfield Modal Handler
 * Handles the modal submission for Endfield token setup
 * Saves SK_OAUTH_CRED_KEY and SK_TOKEN_CACHE_KEY to database
 */

import { type ModalSubmitInteraction, MessageFlags } from "discord.js";
import { User } from "../database/models/User";
import { EndfieldService } from "../services/endfield";
import { ENDFIELD } from "../constants";

export async function handleEndfieldModal(interaction: ModalSubmitInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const cred = interaction.fields.getTextInputValue("endfield-cred").trim();
    const skTokenCacheKey = interaction.fields.getTextInputValue("endfield-token-cache").trim();
    const gameId = interaction.fields.getTextInputValue("endfield-game-id").trim();
    const server = interaction.fields.getTextInputValue("endfield-server").trim() || "2";
    const nickname = interaction.fields.getTextInputValue("endfield-nickname")?.trim() || "Unknown";

    // URL-decode if needed
    let decodedCred = cred;
    if (cred.includes("%")) {
        try {
            decodedCred = decodeURIComponent(cred);
        } catch {
            // Not URL-encoded, use as-is
        }
    }

    // Validate params using service
    const validation = EndfieldService.validateParams(decodedCred, skTokenCacheKey, gameId, server);
    if (!validation.valid) {
        await interaction.editReply({
            content: validation.message || "❌ Invalid parameters."
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
                    skOAuthCredKey: decodedCred,
                    skTokenCacheKey,
                    gameId,
                    server,
                    accountName: nickname
                }
            },
            $setOnInsert: {
                settings: { notifyOnClaim: true }
            }
        },
        { upsert: true, new: true }
    );

    const serverName = ENDFIELD.servers[server] || "Unknown";

    await interaction.editReply({
        content:
            `✅ **Endfield token saved!**\n\n` +
            `**Account**: ${nickname}\n` +
            `**UID**: ${gameId}\n` +
            `**Server**: ${serverName}\n\n` +
            `⚠️ Gunakan \`/claim endfield\` untuk test apakah token berfungsi.`
    });
}
