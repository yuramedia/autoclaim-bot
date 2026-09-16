/**
 * Endfield Modal Handler
 * Handles the modal submission for Endfield token setup
 * Saves ACCOUNT_TOKEN to database
 */

import { ModalSubmitInteraction, MessageFlags } from "discord.js";
import { updateEndfieldCredentials } from "../database";
import { EndfieldService } from "../services/endfield";
import { encryptToken } from "../utils/token-crypto";
import { logger } from "../core/logger";

/**
 * Handles modal submission for Endfield token setup.
 * Decodes the token if base64-encoded, validates against Endfield API,
 * and saves to database.
 * @param interaction - The modal submission interaction from Discord
 * @returns A promise that resolves when the interaction is handled
 */
export async function handleEndfieldModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Sanitize token: remove newlines, carriage returns, quotes
        const accountToken = interaction.fields
            .getTextInputValue("endfield-account-token")
            .trim()
            .replace(/[\r\n"]+/g, "");

        // URI-decode before validation and storage, so the stored token is always the decoded form
        let decodedToken: string;
        try {
            decodedToken = decodeURIComponent(accountToken);
        } catch {
            await interaction.editReply({
                content:
                    "❌ Invalid token: contains malformed percent-encoding. " +
                    "Please copy the token exactly as shown on the Endfield cookie store page."
            });
            return;
        }

        const nickname = interaction.fields.getTextInputValue("endfield-nickname")?.trim() || "Unknown";

        // Validate token
        const validation = EndfieldService.validateParams(decodedToken);
        if (!validation.valid) {
            await interaction.editReply({
                content: validation.message || "❌ Invalid parameters."
            });
            return;
        }

        // Save to database using repository helper
        await updateEndfieldCredentials(
            interaction.user.id,
            {
                accountToken: encryptToken(decodedToken),
                accountName: nickname
            },
            interaction.user.username
        );

        await interaction.editReply({
            content:
                `✅ **Endfield token saved!**\n\n` +
                `**Account**: ${nickname}\n\n` +
                `UID and server will be automatically detected during claim.\n` +
                `⚠️ Use \`/claim endfield\` to test if your token works.`
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
