/**
 * Endfield Modal Handler
 * Handles the modal submission for Endfield token setup
 * Saves ACCOUNT_TOKEN to database
 */

import { type ModalSubmitInteraction, MessageFlags } from "discord.js";
import { User } from "../database/models/user";
import { EndfieldService } from "../services/endfield";
import { encryptToken } from "../utils/token-crypto";
import { logger } from "../core/logger";

/**
 * Handles the modal submission for the Endfield token setup command.
 * Validates the provided credentials, encrypts them, and updates or inserts the user database record.
 * @param interaction - The modal submit interaction from Discord
 * @returns A promise that resolves when the interaction handling is complete
 */
export async function handleEndfieldModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Sanitize token: remove newlines, carriage returns, quotes (mirrors hoyolab-modal sanitization)
        const accountToken = interaction.fields
            .getTextInputValue("endfield-account-token")
            .trim()
            .replace(/[\r\n"]+/g, "");

        // URI-decode before validation and storage, so the stored token is always the decoded form
        // (prevents mismatch with endfield.ts claim() which previously decoded at runtime)
        let decodedToken: string;
        try {
            decodedToken = decodeURIComponent(accountToken);
        } catch {
            // decodeURIComponent throws URIError on malformed percent-encoding (e.g. "%2" without a second digit)
            await interaction.editReply({
                content:
                    "❌ Invalid token: contains malformed percent-encoding. " +
                    "Please copy the token exactly as shown on the Endfield cookie store page."
            });
            return;
        }

        const nickname = interaction.fields.getTextInputValue("endfield-nickname")?.trim() || "Unknown";

        // Validate token (using decoded form for accurate length check)
        const validation = EndfieldService.validateParams(decodedToken);
        if (!validation.valid) {
            await interaction.editReply({
                content: validation.message || "❌ Invalid parameters."
            });
            return;
        }

        // Save to database — encrypt token before storage
        // Use dot-path $set to preserve existing lastClaim/lastClaimResult when user updates token
        await User.findOneAndUpdate(
            { discordId: interaction.user.id },
            {
                $set: {
                    username: interaction.user.username,
                    "endfield.accountToken": encryptToken(decodedToken),
                    "endfield.accountName": nickname
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
    } catch (error: unknown) {
        logger.error(error, "[handleEndfieldModal] Failed to process Endfield modal submission");
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: "❌ An error occurred while saving your Endfield credentials."
                });
            } else {
                await interaction.reply({
                    content: "❌ An error occurred while saving your Endfield credentials.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (replyError) {
            logger.error(replyError, "[handleEndfieldModal] Failed to send error response");
        }
    }
}
