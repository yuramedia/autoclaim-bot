import { StringSelectMenuInteraction, AttachmentBuilder, MessageFlags } from "discord.js";
import { videoSelectionCache } from "./message";
import { downloadDirect } from "../services/media-downloader";
import { getMaxDownloadSize } from "../constants/media-downloader";

export async function handleResolutionSelect(interaction: StringSelectMenuInteraction): Promise<void> {
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

    const selectedFormatUrl = interaction.values[0];
    if (!selectedFormatUrl) return;

    // Remove the select menu immediately to prevent multiple clicks
    await interaction.editReply({ components: [] });

    const maxSizeLimit = getMaxDownloadSize(interaction.guild?.premiumTier);

    try {
        // Download directly from the format URL provided by VKrDownloader
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
    } catch (error: any) {
        await interaction.followUp({
            content: `❌ Error downloading video: ${error.message || "Unknown error"}`,
            flags: MessageFlags.Ephemeral
        });
    }
}
