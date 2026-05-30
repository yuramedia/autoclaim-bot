import { StringSelectMenuInteraction, MessageFlags } from "discord.js";
import { User } from "../database/models/User";
import { getGameDisplayName } from "../constants/games";
import { config } from "../config";

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
}
