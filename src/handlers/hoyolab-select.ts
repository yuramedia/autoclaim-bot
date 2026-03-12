import { StringSelectMenuInteraction, MessageFlags } from "discord.js";
import { User } from "../database/models/User";

/**
 * Format a Hoyolab game key into a display name
 */
function formatGameName(key: string): string {
    switch (key) {
        case "genshin":
            return "Genshin Impact";
        case "starRail":
            return "Honkai: Star Rail";
        case "honkai3":
            return "Honkai Impact 3rd";
        case "tearsOfThemis":
            return "Tears of Themis";
        case "zenlessZoneZero":
            return "Zenless Zone Zero";
        default:
            return key;
    }
}

export async function handleHoyolabSelect(interaction: StringSelectMenuInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const selectedGames = interaction.values;

    const games = {
        genshin: selectedGames.includes("genshin"),
        starRail: selectedGames.includes("starRail"),
        honkai3: selectedGames.includes("honkai3"),
        tearsOfThemis: selectedGames.includes("tearsOfThemis"),
        zenlessZoneZero: selectedGames.includes("zenlessZoneZero")
    };

    // Update user
    await User.findOneAndUpdate(
        { discordId: interaction.user.id },
        {
            $set: {
                "hoyolab.games": games
            }
        }
    );

    const enabledGamesList = Object.entries(games)
        .filter(([, enabled]) => enabled)
        .map(([key]) => `• ${formatGameName(key)}`)
        .join("\n");

    await interaction.editReply({
        content: `✅ **Setup Complete!**\n\nThe following games have been enabled for auto-claim:\n\n${enabledGamesList}\n\nYour rewards will be claimed daily at 00:00 UTC+8.`
    });
}
