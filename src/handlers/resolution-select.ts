import { StringSelectMenuInteraction, AttachmentBuilder, MessageFlags } from "discord.js";
import { videoSelectionCache } from "./message";
import { getMaxDownloadSize } from "../constants/media-downloader";
import { logger } from "../core/logger";

/**
 * Handles the resolution selection interaction for media downloads.
 * Downloads the video at the chosen resolution and uploads the file to the channel.
 * @param interaction - The select menu interaction from Discord
 * @returns A promise that resolves when the interaction is handled
 */
export async function handleResolutionSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        await interaction.deferUpdate();

        const selectionId = interaction.customId.replace("res_select|", "");
        const cachedData = videoSelectionCache.get(selectionId);

        if (!cachedData) {
            await interaction.followUp({
                content: "❌ This selection has expired. Please send the link again.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Clean up cache entry immediately to free memory
        videoSelectionCache.delete(selectionId);

        // The select menu value is a format index into the cached formats array
        const selectedIndex = parseInt(interaction.values[0] ?? "", 10);
        const formats = cachedData.formats;
        if (isNaN(selectedIndex) || !formats || !formats[selectedIndex]) {
            await interaction.followUp({
                content: "❌ Invalid selection. Please send the link again.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        const selectedFormatUrl = formats[selectedIndex].url;

        // Remove the select menu immediately to prevent multiple clicks
        await interaction.editReply({ components: [] });

        const maxSizeLimit = getMaxDownloadSize(interaction.guild?.premiumTier);

        try {
            // Download directly from the format URL provided by VKrDownloader
            // (lazy-loaded — media-downloader pulls heavy deps only when needed)
            const { downloadDirect } = await import("../services/media-downloader");
            const result = await downloadDirect(selectedFormatUrl, "video.mp4", maxSizeLimit);

            if (result.success && result.buffer) {
                const attachment = new AttachmentBuilder(result.buffer, { name: result.filename });
                // By passing only files array, discord.js will append the file to the existing message
                await interaction.editReply({ files: [attachment] });
            } else {
                await interaction.followUp({
                    content: `❌ Download failed: ${result.error}`,
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            await interaction.followUp({
                content: `❌ Error downloading video: ${msg}`,
                flags: MessageFlags.Ephemeral
            });
        }
    } catch (outerError: unknown) {
        logger.error(outerError, "[handleResolutionSelect] Unexpected error");
        try {
            await interaction.followUp({
                content: "❌ An unexpected error occurred while processing your resolution selection.",
                flags: MessageFlags.Ephemeral
            });
        } catch (replyError) {
            logger.error(replyError, "[handleResolutionSelect] Failed to send error feedback");
        }
    }
}
