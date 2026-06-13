/**
 * Hoyolab Modal Handler
 * Handles the modal submission for Hoyolab token setup
 */

import {
    type ModalSubmitInteraction,
    MessageFlags,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    ActionRowBuilder
} from "discord.js";
import { User } from "../database/models/user";
import { HoyolabService } from "../services/hoyolab";
import { GAME_DISPLAY_NAMES, type HoyolabGameKey } from "../constants";
import { encryptToken } from "../utils/token-crypto";
import { logger } from "../core/logger";

/** Default game options for select menu */
const GAME_SELECT_OPTIONS: Array<{ key: HoyolabGameKey; emoji: string }> = [
    { key: "genshin", emoji: "✨" },
    { key: "starRail", emoji: "🚂" },
    { key: "zenlessZoneZero", emoji: "💤" },
    { key: "honkai3", emoji: "☄️" },
    { key: "tearsOfThemis", emoji: "⚖️" }
];

/**
 * Handles the modal submission for the Hoyolab token setup command.
 * Validates the cookie tokens, displays warnings for missing components, stores them encrypted,
 * and replies with a multi-select menu to choose games for auto-claiming.
 * @param interaction - The modal submit interaction from Discord
 * @returns A promise that resolves when the interaction handling is complete
 */
export async function handleHoyolabModal(interaction: ModalSubmitInteraction): Promise<void> {
    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Sanitize token: remove newlines, carriage returns, and quotes
        const token = interaction.fields
            .getTextInputValue("hoyolab-token")
            .trim()
            .replace(/[\r\n"]+/g, "");

        const nickname = interaction.fields.getTextInputValue("hoyolab-nickname")?.trim() || "Unknown";

        // Validate token quality
        const hasLToken = token.includes("ltoken") || token.includes("ltoken_v2");
        const hasCookieToken = token.includes("cookie_token") || token.includes("cookie_token_v2");
        const hasAccountId = token.includes("account_id") || token.includes("account_id_v2");

        let warningMsg = "";
        if (!hasLToken) {
            warningMsg += "\n⚠️ **Critical:** `ltoken` is missing. Daily check-in might fail.";
        }
        if (!hasCookieToken) {
            warningMsg += "\n⚠️ **Warning:** `cookie_token` is missing. `/redeem` will FAIL.";
        } else if (!hasAccountId) {
            warningMsg += "\n⚠️ **Warning:** `account_id` is missing. `/redeem` requires it matching `cookie_token`.";
        }

        // Validate token
        const service = new HoyolabService(token);
        const validation = await service.validateToken();

        if (!validation.valid) {
            await interaction.editReply({
                content: `❌ Invalid token: ${validation.message}\n\nMake sure to copy the full cookie including \`ltoken_v2\` and \`ltuid_v2\`.`
            });
            return;
        }

        // Save to database (partial update) — encrypt token before storage
        await User.findOneAndUpdate(
            { discordId: interaction.user.id },
            {
                $set: {
                    username: interaction.user.username,
                    "hoyolab.token": encryptToken(token),
                    "hoyolab.accountName": nickname,
                    // Default all games to false initially, user will select them next
                    "hoyolab.games": {
                        genshin: false,
                        starRail: false,
                        honkai3: false,
                        tearsOfThemis: false,
                        zenlessZoneZero: false
                    }
                },
                $setOnInsert: {
                    settings: { notifyOnClaim: true }
                }
            },
            { upsert: true, new: true }
        );

        // Create Select Menu using centralized constants
        const select = new StringSelectMenuBuilder()
            .setCustomId("hoyolab-games-select")
            .setPlaceholder("Select games to auto-claim")
            .setMinValues(1)
            .setMaxValues(5)
            .addOptions(
                GAME_SELECT_OPTIONS.map(({ key, emoji }) =>
                    new StringSelectMenuOptionBuilder().setLabel(GAME_DISPLAY_NAMES[key]).setValue(key).setEmoji(emoji)
                )
            );

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

        await interaction.editReply({
            content: `✅ Hoyolab token saved for **${nickname}**!${warningMsg}\n⬇️ **Now, please select your games below:**`,
            components: [row]
        });
    } catch (error: unknown) {
        logger.error(error, "[handleHoyolabModal] Failed to process Hoyolab modal submission");
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: "❌ An error occurred while saving your Hoyolab credentials."
                });
            } else {
                await interaction.reply({
                    content: "❌ An error occurred while saving your Hoyolab credentials.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (replyError) {
            logger.error(replyError, "[handleHoyolabModal] Failed to send error response");
        }
    }
}
