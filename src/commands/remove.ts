/**
 * Remove Command
 * Remove user tokens from the database
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { User } from "../database/models/user";
import { logger } from "../core/logger";

/**
 * Slash command data for the remove command.
 */
export const data = new SlashCommandBuilder()
    .setName("remove")
    .setDescription("Remove your tokens from the database")
    .addStringOption(option =>
        option
            .setName("service")
            .setDescription("Which service to remove")
            .setRequired(true)
            .addChoices(
                { name: "All", value: "all" },
                { name: "Hoyolab", value: "hoyolab" },
                { name: "Endfield", value: "endfield" }
            )
    );

/**
 * Executes the remove command to remove user tokens and account setup data.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const service = interaction.options.getString("service", true);
        const user = await User.findOne({ discordId: interaction.user.id });

        if (!user) {
            await interaction.editReply({
                content: "❌ You have no tokens stored."
            });
            return;
        }

        if (service === "all") {
            await User.deleteOne({ discordId: interaction.user.id });
            await interaction.editReply({
                content: "✅ All your data has been removed."
            });
        } else if (service === "hoyolab") {
            user.hoyolab = undefined;
            await user.save();
            await interaction.editReply({
                content: "✅ Your Hoyolab token has been removed."
            });
        } else if (service === "endfield") {
            user.endfield = undefined;
            await user.save();
            await interaction.editReply({
                content: "✅ Your Endfield token has been removed."
            });
        }
    } catch (error) {
        logger.error(error, "Remove command failed");
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: "❌ An error occurred while removing your tokens." });
            } else {
                await interaction.reply({
                    content: "❌ An error occurred while removing your tokens.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (e) {
            logger.error(e, "Failed to send error reply");
        }
    }
}
