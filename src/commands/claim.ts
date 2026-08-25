/**
 * Claim Command
 * Manually trigger daily reward claims
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { User } from "../database/models/user";
import { HoyolabService, formatHoyolabResults } from "../services/hoyolab";
import { EndfieldService, formatEndfieldResult } from "../services/endfield";
import { decryptTokenCompat, encryptToken } from "../utils/token-crypto";
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

        // Run services in parallel — they hit independent APIs and each
        // persists its own atomic result update.
        const [hoyolabField, endfieldField] = await Promise.all([
            (async (): Promise<{ name: string; value: string } | null> => {
                if ((service !== "all" && service !== "hoyolab") || !user.hoyolab?.token) return null;
                try {
                    const hoyolabDecrypt = decryptTokenCompat(user.hoyolab.token);
                    const hoyolabService = new HoyolabService(hoyolabDecrypt.value);
                    const results = await hoyolabService.claimAll(user.hoyolab.games);

                    // Atomic update — avoids race with scheduler overwriting the same document
                    const hoyolabResultText = results.map(r => `${r.game}: ${r.success ? "✅" : "❌"}`).join(", ");
                    const hoyolabUpdate: Record<string, unknown> = {
                        "hoyolab.lastClaim": new Date(),
                        "hoyolab.lastClaimResult": hoyolabResultText
                    };
                    // Re-encrypt token in v1 format if it came from legacy/plaintext
                    if (hoyolabDecrypt.needsReEncryption) {
                        hoyolabUpdate["hoyolab.token"] = encryptToken(hoyolabDecrypt.value);
                    }
                    await User.updateOne({ discordId: interaction.user.id }, { $set: hoyolabUpdate });

                    return { name: "🌟 Hoyolab", value: formatHoyolabResults(results) };
                } catch (error) {
                    logger.error(error, "[Claim] Hoyolab claim failed");
                    throw error;
                }
            })(),
            (async (): Promise<{ name: string; value: string } | null> => {
                if ((service !== "all" && service !== "endfield") || !user.endfield?.accountToken) return null;
                try {
                    const endfieldDecrypt = decryptTokenCompat(user.endfield.accountToken);
                    const endfieldService = new EndfieldService({
                        accountToken: endfieldDecrypt.value
                    });
                    const result = await endfieldService.claim();

                    // Atomic update — avoids race with scheduler overwriting the same document
                    const endfieldResultText = result.success ? "✅ Success" : `❌ ${result.message}`;
                    const endfieldUpdate: Record<string, unknown> = {
                        "endfield.lastClaim": new Date(),
                        "endfield.lastClaimResult": endfieldResultText
                    };
                    // Re-encrypt token in v1 format if it came from legacy/plaintext
                    if (endfieldDecrypt.needsReEncryption) {
                        endfieldUpdate["endfield.accountToken"] = encryptToken(endfieldDecrypt.value);
                    }
                    await User.updateOne({ discordId: interaction.user.id }, { $set: endfieldUpdate });

                    return { name: "🎮 Endfield", value: formatEndfieldResult(result) };
                } catch (error) {
                    logger.error(error, "[Claim] Endfield claim failed");
                    throw error;
                }
            })()
        ]);

        let hasResults = false;
        if (hoyolabField) {
            embed.addFields({ ...hoyolabField, inline: false });
            hasResults = true;
        }
        if (endfieldField) {
            embed.addFields({ ...endfieldField, inline: false });
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
        // decryptTokenCompat never throws for format reasons, but claim logic
        // could still fail (API errors, validation, etc.)
        const userMessage = "❌ An error occurred while executing the claim command.";
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
