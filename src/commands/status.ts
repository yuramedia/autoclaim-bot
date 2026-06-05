/**
 * Status Command
 * Display user's auto-claim configuration and history
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { User } from "../database/models/user";
import { GAME_DISPLAY_NAMES } from "../constants";
import { formatUtc8DateTime, discordTimestamp } from "../utils/time";

export const data = new SlashCommandBuilder().setName("status").setDescription("Check your auto-claim status");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = await User.findOne({ discordId: interaction.user.id });

    if (!user) {
        await interaction.editReply({
            content: "❌ You have not set up any tokens yet. Use `/setup-hoyolab` or `/setup-endfield` to get started."
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("📊 Auto-Claim Status")
        .setColor(0x5865f2)
        .setTimestamp()
        .setFooter({ text: `Requested by ${interaction.user.username}` });

    // Server time in UTC+8
    const timeStr = formatUtc8DateTime();

    embed.setDescription(`🕐 **Server Time (UTC+8):** ${timeStr}`);

    // Hoyolab status
    if (user.hoyolab?.token) {
        const enabledGames = user.hoyolab.games
            ? Object.entries(user.hoyolab.games)
                  .filter(([_, enabled]) => enabled)
                  .map(([key]) => GAME_DISPLAY_NAMES[key as keyof typeof GAME_DISPLAY_NAMES] || key)
                  .join(", ") || "None"
            : "None";

        const lastClaim = user.hoyolab.lastClaim ? discordTimestamp(user.hoyolab.lastClaim, "R") : "Never";

        embed.addFields({
            name: "🌟 Hoyolab",
            value: [
                `**Account:** ${user.hoyolab.accountName || "Unknown"}`,
                `**Games:** ${enabledGames}`,
                `**Last Claim:** ${lastClaim}`,
                `**Result:** ${user.hoyolab.lastClaimResult || "N/A"}`
            ].join("\n"),
            inline: false
        });
    } else {
        embed.addFields({
            name: "🌟 Hoyolab",
            value: "❌ Not configured",
            inline: false
        });
    }

    // Endfield status
    if (user.endfield?.accountToken) {
        const lastClaim = user.endfield.lastClaim ? discordTimestamp(user.endfield.lastClaim, "R") : "Never";

        embed.addFields({
            name: "🎮 Endfield",
            value: [
                `**Account:** ${user.endfield.accountName || "Unknown"}`,
                `**Last Claim:** ${lastClaim}`,
                `**Result:** ${user.endfield.lastClaimResult || "N/A"}`
            ].join("\n"),
            inline: false
        });
    } else {
        embed.addFields({
            name: "🎮 Endfield",
            value: "❌ Not configured",
            inline: false
        });
    }

    // Settings
    embed.addFields({
        name: "⚙️ Settings",
        value: `**Notify on Claim:** ${user.settings?.notifyOnClaim ? "✅ Enabled" : "❌ Disabled"}`,
        inline: false
    });

    await interaction.editReply({ embeds: [embed] });
}
