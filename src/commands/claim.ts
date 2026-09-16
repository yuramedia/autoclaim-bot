/**
 * Claim Command
 * Manually trigger daily reward claims
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { User, recordClaimHistory } from "../database";
import { HoyolabService, formatHoyolabResults } from "../services/hoyolab";
import { EndfieldService, formatEndfieldResult } from "../services/endfield";
import { logger } from "../core/logger";
import { decryptTokenCompat, encryptToken } from "../utils/token-crypto";
import { getCooldownRemaining, setCooldown, formatCooldown } from "../utils/cooldown";

/** Cooldown duration for the claim command in milliseconds (30 seconds). */
export const CLAIM_COOLDOWN_MS = 30_000;

/**
 * Slash command definition for manual daily rewards claiming.
 */
export const data = new SlashCommandBuilder()
    .setName("claim")
    .setDescription("Manually claim daily check-in rewards")
    .addStringOption(option =>
        option
            .setName("service")
            .setDescription("Service to claim rewards for")
            .setRequired(false)
            .addChoices(
                { name: "All Services", value: "all" },
                { name: "Hoyolab (Genshin, HSR, HI3, etc.)", value: "hoyolab" },
                { name: "SKPORT (Arknights: Endfield)", value: "endfield" }
            )
    );

/**
 * Executes the claim command to manually trigger daily reward claims.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
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
        const user = await User.findOne({ discordId: interaction.user.id }).lean();

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

                    // Record history asynchronously
                    void recordClaimHistory(
                        results.map(r => ({
                            discordId: interaction.user.id,
                            service: "hoyolab",
                            game: r.game,
                            success: r.success,
                            message: r.message
                        }))
                    );

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

                    // Record history asynchronously
                    void recordClaimHistory({
                        discordId: interaction.user.id,
                        service: "endfield",
                        game: "Endfield",
                        success: result.success,
                        message: result.message
                    });

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
