/**
 * Redeem Command
 * Redeem gift codes for HoYoverse game accounts
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { User } from "../database/models/user";
import { HoyolabService, type GameAccount } from "../services/hoyolab";
import { getCodes } from "../services/code-source";
import { getGameDisplayName } from "../constants";
import { decryptTokenCompat, encryptToken } from "../utils/token-crypto";
import { logger } from "../core/logger";

/**
 * Slash command data for the redeem command.
 */
export const data = new SlashCommandBuilder()
    .setName("redeem")
    .setDescription("Redeem gift codes for your HoYoverse accounts")
    .addSubcommand(subcommand =>
        subcommand
            .setName("manual")
            .setDescription("Redeem a specific code manually")
            .addStringOption(option =>
                option
                    .setName("game")
                    .setDescription("The game to redeem for")
                    .setRequired(true)
                    .addChoices(
                        { name: "Genshin Impact", value: "genshin" },
                        { name: "Honkai: Star Rail", value: "starRail" },
                        { name: "Zenless Zone Zero", value: "zenlessZoneZero" }
                    )
            )
            .addStringOption(option => option.setName("code").setDescription("The redemption code").setRequired(true))
    )
    .addSubcommand(subcommand =>
        subcommand.setName("auto").setDescription("Automatically check and redeem available codes from community DB")
    );

async function redeemForUser(
    hoyolab: HoyolabService,
    gameKey: string,
    codes: string[],
    accounts?: GameAccount[]
): Promise<string[]> {
    try {
        if (!accounts) {
            accounts = await hoyolab.getGameAccounts(gameKey);
        }

        if (accounts.length === 0) return [`No accounts found for ${getGameDisplayName(gameKey)}`];

        const results: string[] = [];

        for (const account of accounts) {
            const gameName = getGameDisplayName(gameKey);
            const accInfo = `${gameName} [${account.region_name} - ${account.nickname}]`;
            let isFirstAttempt = true;
            for (const code of codes) {
                // Rate-limit between consecutive attempts only (avoids -1048 and cooldown errors)
                if (!isFirstAttempt) {
                    await new Promise(r => setTimeout(r, REDEEM_RATE_LIMIT_DELAY_MS));
                }
                isFirstAttempt = false;
                try {
                    const result = await hoyolab.redeemCode(gameKey, account, code);
                    const icon = result.success ? "✅" : "❌";
                    results.push(`${icon} **${accInfo}** (${code}): ${result.message}`);
                } catch (codeErr) {
                    logger.error({ msg: `Failed to redeem code ${code} for ${accInfo}`, err: codeErr });
                    results.push(
                        `❌ **${accInfo}** (${code}): ${codeErr instanceof Error ? codeErr.message : String(codeErr)}`
                    );
                }
            }
        }
        return results;
    } catch (error) {
        logger.error({ msg: "redeemForUser helper failed", err: error });
        return [`Error running code redemption: ${error instanceof Error ? error.message : String(error)}`];
    }
}

/** Rate-limit delay between consecutive redemption attempts (ms). */
const REDEEM_RATE_LIMIT_DELAY_MS = 5000;

/**
 * Executes the redeem command to perform manual or automatic gift code redemption.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const user = await User.findOne({ discordId: interaction.user.id });
    if (!user || !user.hoyolab?.token) {
        await interaction.editReply({
            content: "❌ You need to setup your Hoyolab account first using `/setup-hoyolab`."
        });
        return;
    }

    const hoyolabDecrypt = decryptTokenCompat(user.hoyolab.token);
    const hoyolab = new HoyolabService(hoyolabDecrypt.value);

    // Re-encrypt token in v1 format if it came from legacy/plaintext
    if (hoyolabDecrypt.needsReEncryption) {
        await User.updateOne(
            { discordId: interaction.user.id },
            { $set: { "hoyolab.token": encryptToken(hoyolabDecrypt.value) } }
        );
    }

    const subcommand = interaction.options.getSubcommand();

    try {
        if (subcommand === "manual") {
            const game = interaction.options.getString("game", true);
            const code = interaction.options.getString("code", true).trim();

            const results = await redeemForUser(hoyolab, game, [code]);

            const embed = new EmbedBuilder()
                .setTitle("Manual Redemption Result")
                .setColor(0x00ff00) // Green
                .setDescription(results.join("\n") || "No actions taken.")
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } else if (subcommand === "auto") {
            await interaction.editReply("⏳ Fetching codes and redeeming... This may take a moment.");

            const sourceCodes = await getCodes();
            if (!sourceCodes) {
                await interaction.editReply("❌ Failed to fetch active codes from the database.");
                return;
            }

            const messages: string[] = [];

            // Map our game keys to Hashblen keys
            // Hashblen keys: hsr, genshin, zzz
            // Our keys: starRail, genshin, zenlessZoneZero

            const gameTasks: Array<{ key: string; codes: string[] }> = [];
            if (sourceCodes.genshin?.length) {
                gameTasks.push({ key: "genshin", codes: sourceCodes.genshin.map(c => c.code) });
            }
            if (sourceCodes.hsr?.length) {
                gameTasks.push({ key: "starRail", codes: sourceCodes.hsr.map(c => c.code) });
            }
            if (sourceCodes.zzz?.length) {
                gameTasks.push({ key: "zenlessZoneZero", codes: sourceCodes.zzz.map(c => c.code) });
            }

            // Games redeem against independent endpoints — run in parallel.
            const perGameResults = await Promise.all(
                gameTasks.map(({ key, codes }) => redeemForUser(hoyolab, key, codes))
            );
            for (const gameMessages of perGameResults) {
                messages.push(...gameMessages);
            }

            // Split message if too long (Discord limit is 4096 for description, but let's be safe)
            const fullLog = messages.join("\n");
            if (fullLog.length > 4000) {
                // Simple truncation for now, or send as file
                const buffer = Buffer.from(fullLog, "utf-8");
                await interaction.editReply({
                    content: "✅ Auto-redemption complete! Logic too long to display, see attachment.",
                    files: [{ attachment: buffer, name: "redemption-log.txt" }]
                });
            } else {
                const embed = new EmbedBuilder()
                    .setTitle("Auto Redemption Result")
                    .setColor(0x0099ff)
                    .setDescription(fullLog || "No codes found or no matching games enabled.")
                    .setTimestamp();
                await interaction.editReply({ content: null, embeds: [embed] });
            }
        }
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error({ msg: "Redeem command error", err: error });
        await interaction.editReply({
            content: `❌ An error occurred: ${errorMessage}`
        });
    }
}
