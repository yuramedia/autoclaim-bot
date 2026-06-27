/**
 * Claim Command
 * Manually trigger daily reward claims
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { User } from "../database/models/user";
import { HoyolabService, formatHoyolabResults } from "../services/hoyolab";
import { EndfieldService, formatEndfieldResult } from "../services/endfield";
import { decryptToken } from "../utils/token-crypto";
import { getCooldownRemaining, setCooldown, formatCooldown } from "../utils/cooldown";
import { logger } from "../core/logger";

const CLAIM_COOLDOWN_MS = 30_000; // 30 seconds

/**
 * Slash command data for the claim command.
 */
export const data = new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Manually claim daily rewards now")
    .addStringOption(option =>
        option
            .setName("service")
            .setDescription("Which service to claim (default: all)")
            .setRequired(false)
            .addChoices(
                { name: "All", value: "all" },
                { name: "Hoyolab", value: "hoyolab" },
                { name: "Endfield", value: "endfield" }
            )
    );

/**
 * Executes the claim command to manually trigger daily reward claims.
 *
 * @param interaction The command interaction from Discord.
 * @returns A promise that resolves when the command is executed.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        // Cooldown check
        const remaining = getCooldownRemaining("claim", interaction.user.id, CLAIM_COOLDOWN_MS);
        if (remaining > 0) {
            await interaction.reply({
                content: `⏳ Slow down! You can use \`/claim\` again in **${formatCooldown(remaining)}**.`,
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const service = interaction.options.getString("service") || "all";
        const user = await User.findOne({ discordId: interaction.user.id });

        if (!user) {
            await interaction.editReply({
                content: "❌ You have not set up any tokens yet. Use `/setup-hoyolab` or `/setup-endfield` first."
            });
            return;
        }

        const embed = new EmbedBuilder().setTitle("🎁 Daily Claim Results").setColor(0x00ae86).setTimestamp();

        let hasResults = false;

        // Claim Hoyolab
        if ((service === "all" || service === "hoyolab") && user.hoyolab?.token) {
            const hoyolabService = new HoyolabService(decryptToken(user.hoyolab.token));
            const results = await hoyolabService.claimAll(user.hoyolab.games);

            embed.addFields({
                name: "🌟 Hoyolab",
                value: formatHoyolabResults(results),
                inline: false
            });

            // Atomic update — avoids race with scheduler overwriting the same document
            const hoyolabResultText = results.map(r => `${r.game}: ${r.success ? "✅" : "❌"}`).join(", ");
            await User.updateOne(
                { discordId: interaction.user.id },
                { $set: { "hoyolab.lastClaim": new Date(), "hoyolab.lastClaimResult": hoyolabResultText } }
            );
            hasResults = true;
        }

        // Claim Endfield
        if ((service === "all" || service === "endfield") && user.endfield?.accountToken) {
            const endfieldService = new EndfieldService({
                accountToken: decryptToken(user.endfield.accountToken)
            });
            const result = await endfieldService.claim();

            embed.addFields({
                name: "🎮 Endfield",
                value: formatEndfieldResult(result),
                inline: false
            });

            // Atomic update — avoids race with scheduler overwriting the same document
            const endfieldResultText = result.success ? "✅ Success" : `❌ ${result.message}`;
            await User.updateOne(
                { discordId: interaction.user.id },
                { $set: { "endfield.lastClaim": new Date(), "endfield.lastClaimResult": endfieldResultText } }
            );
            hasResults = true;
        }

        if (!hasResults) {
            await interaction.editReply({
                content: `❌ No tokens configured for the selected service. Use \`/setup-hoyolab\` or \`/setup-endfield\` first.`
            });
            return;
        }

        setCooldown("claim", interaction.user.id);
        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error(error, "Claim command failed");
        // Special-case token decryption/format errors — give actionable remediation
        const isDecryptError =
            error instanceof Error &&
            (error.message.includes("decryption failed") ||
                error.message.includes("not in encrypted format") ||
                error.message.includes("encryption key"));
        const userMessage = isDecryptError
            ? "❌ Your stored token could not be decrypted. This may happen after a key rotation. " +
              "Please re-run `/setup-hoyolab` or `/setup-endfield` to update your credentials."
            : "❌ An error occurred while executing the claim command.";
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: userMessage
                });
            } else {
                await interaction.reply({
                    content: userMessage,
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (e) {
            logger.error(e, "Failed to send error reply");
        }
    }
}
