/**
 * Help Command
 * Display usage instructions for all bot features
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { config } from "../config";
import { logger } from "../core/logger";

/**
 * Slash command data for the help command.
 */
export const data = new SlashCommandBuilder().setName("help").setDescription("Show how to use this bot");

/**
 * Executes the help command to display general information and instructions.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        const embed = new EmbedBuilder()
            .setTitle("📖 Auto-Claim Bot Help")
            .setColor(0x5865f2)
            .setDescription("This bot helps you automatically claim daily rewards for Hoyolab and Arknights: Endfield.")
            .addFields(
                {
                    name: "🔧 Setup Commands",
                    value: [
                        "`/setup-hoyolab` - Setup Hoyolab token",
                        "`/setup-endfield` - Setup SKPORT/Endfield token"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "🎮 Claim Commands",
                    value: [
                        "`/claim` - Manually claim all rewards",
                        "`/claim hoyolab` - Claim Hoyolab rewards only",
                        "`/claim endfield` - Claim Endfield rewards only",
                        "`/redeem <game> <code>` - Redeem game code"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "📈 Embed Fixer & Media Downloader",
                    value: [
                        "`/embed <url>` - Generate fixed embed or download media manually",
                        "`/embed-settings` - Toggle auto-fix platforms for the server (Twitter, TikTok, Instagram, Nyaa, NekoBT, Tsukihime, etc.)",
                        "💡 *Tip: Send social media links in chat for auto-fix embeds & direct video uploads.*"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "📺 Anime Feed & Subtitles",
                    value: [
                        "`/crrelease` - View seasonal anime release schedule on Crunchyroll",
                        "`/crunchyroll-feed` - Setup auto-feed for new Crunchyroll episodes in a channel",
                        "`/subcr` - Search and download subtitles (.ass) from Crunchyroll",
                        "`/u2-feed` - Setup auto-feed for U2 BDMV RSS in a channel",
                        "`/bestrelease` - Recommended sub groups for seasonal anime"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "🔍 Dictionaries & Utilities",
                    value: [
                        "`/jisho <word>` - Search Japanese-English dictionary on Jisho",
                        "`/kbbi <word>` - Search Indonesian definitions in KBBI dictionary"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "📊 Info Commands",
                    value: [
                        "`/status` - View token status & claim history",
                        "`/statistic` - View overall bot statistics",
                        "`/ping` - Check bot latency"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "⚙️ Settings Commands",
                    value: [
                        "`/settings notify true/false` - Toggle DM notifications",
                        "`/remove all/hoyolab/endfield` - Remove saved tokens"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "📝 How to Get Tokens",
                    value: "━━━━━━━━━━━━━━━━━━━━━",
                    inline: false
                },
                {
                    name: "🌟 Hoyolab Token",
                    value: [
                        "1. Open https://www.hoyolab.com and log in",
                        "2. Press F12 → **Application** → **Cookies**",
                        "3. Click `.hoyolab.com`",
                        "4. Copy values from the following cookies:",
                        "",
                        "**Required cookies:**",
                        "• `ltoken_v2` - Primary authentication token",
                        "• `ltuid_v2` - Hoyolab User ID",
                        "",
                        "**Optional (for /redeem):**",
                        "• `cookie_token_v2` - Token for redeeming code",
                        "",
                        "Format: `ltoken_v2=xxx; ltuid_v2=xxx; cookie_token_v2=xxx`",
                        "",
                        "⚠️ *HttpOnly cookie, must be copied manually from the Application tab*"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "🎮 Endfield Token (1 token only)",
                    value: [
                        "1. Log in to https://game.skport.com/endfield/sign-in",
                        "2. Open new tab: https://web-api.skport.com/cookie_store/account_token",
                        "3. Copy the `code` portion from the JSON response",
                        "4. Paste into `/setup-endfield`",
                        "",
                        "✅ UID and server automatically detected",
                        "✅ Supports multi-region (Asia + Americas)",
                        "✅ Token lasts for weeks"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "⏰ Auto-Claim Schedule",
                    value: (() => {
                        const { hour, minute } = config.scheduler;
                        const t = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} UTC+8`;
                        return `Daily rewards will be claimed automatically every day at **${t}**.`;
                    })(),
                    inline: false
                }
            )
            .setFooter({ text: "Auto-Claim Bot • Hoyolab & Endfield" })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        logger.error(error, "Help command failed");
        try {
            await interaction.reply({
                content: "❌ An error occurred while displaying the help menu.",
                flags: MessageFlags.Ephemeral
            });
        } catch (e) {
            logger.error(e, "Failed to send error reply");
        }
    }
}
