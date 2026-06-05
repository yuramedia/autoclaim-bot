import { StringSelectMenuInteraction, MessageFlags } from "discord.js";
import { User } from "../database/models/user";
import { getGameDisplayName } from "../constants/games";
import { config } from "../config";

/**
 * Handles the game selection interaction for Hoyolab accounts.
 * Updates the user's selected games in the database and sends a confirmation message showing the daily claim time.
 * @param interaction - The select menu interaction from Discord
 * @returns A promise that resolves when the interaction is handled
 */
export async function handleHoyolabSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const selectedGames = interaction.values;

        const games = {
            genshin: selectedGames.includes("genshin"),
            starRail: selectedGames.includes("starRail"),
            honkai3: selectedGames.includes("honkai3"),
            tearsOfThemis: selectedGames.includes("tearsOfThemis"),
            zenlessZoneZero: selectedGames.includes("zenlessZoneZero")
        };

        await User.findOneAndUpdate({ discordId: interaction.user.id }, { $set: { "hoyolab.games": games } });

        const enabledGamesList = Object.entries(games)
            .filter(([, enabled]) => enabled)
            .map(([key]) => `• ${getGameDisplayName(key)}`)
            .join("\n");

        const { hour, minute } = config.scheduler;
        const claimTime = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} UTC+8`;

        await interaction.editReply({
            content: `✅ **Setup Complete!**\n\nThe following games have been enabled for auto-claim:\n\n${enabledGamesList}\n\nYour rewards will be claimed daily at **${claimTime}**.`
        });
    } catch (error: unknown) {
        console.error("[handleHoyolabSelect] Failed to process Hoyolab game selection:", error);
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: "❌ An error occurred while saving your game selection."
                });
            } else {
                await interaction.reply({
                    content: "❌ An error occurred while saving your game selection.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (replyError) {
            console.error("[handleHoyolabSelect] Failed to send error response:", replyError);
        }
    }
}
