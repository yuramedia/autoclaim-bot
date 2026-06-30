/**
 * Settings Command
 * Manage user preferences for auto-claim
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, MessageFlags } from "discord.js";
import { User } from "../database/models/user";
import { logger } from "../core/logger";

/**
 * Slash command data for the settings command.
 */
export const data = new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Manage your auto-claim settings")
    .addSubcommand(subcommand =>
        subcommand
            .setName("notify")
            .setDescription("Toggle DM notifications after claims")
            .addBooleanOption(option =>
                option.setName("enabled").setDescription("Enable or disable notifications").setRequired(true)
            )
    );

/**
 * Executes the settings command to configure preferences such as DM notifications.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "notify") {
            const enabled = interaction.options.getBoolean("enabled", true);

            await User.findOneAndUpdate(
                { discordId: interaction.user.id },
                {
                    $set: {
                        username: interaction.user.username,
                        "settings.notifyOnClaim": enabled
                    }
                },
                { upsert: true }
            );

            await interaction.editReply({
                content: enabled
                    ? "✅ DM notifications enabled. You will receive claim results via DM."
                    : "❌ DM notifications disabled. You will no longer receive claim results."
            });
        }
    } catch (error) {
        logger.error(error, "Settings command failed");
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: "❌ An error occurred while updating settings." });
            } else {
                await interaction.reply({
                    content: "❌ An error occurred while updating settings.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (e) {
            logger.error(e, "Failed to send error reply");
        }
    }
}
