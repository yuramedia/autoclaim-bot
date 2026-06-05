/**
 * Help Command
 * Display usage instructions for all bot features
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { config } from "../config";

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
            .setDescription("Bot ini membantu kamu claim daily reward otomatis untuk Hoyolab dan Arknights: Endfield.")
            .addFields(
                {
                    name: "🔧 Setup Commands",
                    value: [
                        "`/setup-hoyolab` - Setup token Hoyolab",
                        "`/setup-endfield` - Setup token SKPORT/Endfield"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "🎮 Claim Commands",
                    value: [
                        "`/claim` - Claim manual semua reward",
                        "`/claim hoyolab` - Claim Hoyolab saja",
                        "`/claim endfield` - Claim Endfield saja",
                        "`/redeem <game> <code>` - Redeem code game"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "📊 Info Commands",
                    value: [
                        "`/status` - Lihat status token & riwayat claim",
                        "`/statistic` - Lihat statistik claim keseluruhan",
                        "`/ping` - Cek latency bot",
                        "`/speedtest` - Test kecepatan network bot"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "⚙️ Settings Commands",
                    value: [
                        "`/settings notify true/false` - Toggle notifikasi DM",
                        "`/embed-settings` - Kustomisasi tampilan embed",
                        "`/remove all/hoyolab/endfield` - Hapus token"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "📝 Cara Mendapatkan Token",
                    value: "━━━━━━━━━━━━━━━━━━━━━",
                    inline: false
                },
                {
                    name: "🌟 Hoyolab Token",
                    value: [
                        "1. Buka https://www.hoyolab.com dan login",
                        "2. Tekan F12 → **Application** → **Cookies**",
                        "3. Klik `.hoyolab.com`",
                        "4. Copy nilai dari cookie berikut:",
                        "",
                        "**Required cookies:**",
                        "• `ltoken_v2` - Token autentikasi utama",
                        "• `ltuid_v2` - User ID Hoyolab",
                        "",
                        "**Optional (untuk /redeem):**",
                        "• `cookie_token_v2` - Token untuk redeem code",
                        "",
                        "Format: `ltoken_v2=xxx; ltuid_v2=xxx; cookie_token_v2=xxx`",
                        "",
                        "⚠️ *Cookie HttpOnly, harus copy manual dari tab Application*"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "🎮 Endfield Token (1 token saja)",
                    value: [
                        "1. Login ke https://game.skport.com/endfield/sign-in",
                        "2. Buka tab baru: https://web-api.skport.com/cookie_store/account_token",
                        "3. Copy bagian `code` dari JSON yang muncul",
                        "4. Paste di `/setup-endfield`",
                        "",
                        "✅ UID dan server otomatis terdeteksi",
                        "✅ Support multi-region (Asia + Americas)",
                        "✅ Token bertahan berminggu-minggu"
                    ].join("\n"),
                    inline: false
                },
                {
                    name: "⏰ Auto-Claim Schedule",
                    value: (() => {
                        const { hour, minute } = config.scheduler;
                        const t = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} UTC+8`;
                        return `Daily rewards akan di-claim otomatis setiap **${t}**.`;
                    })(),
                    inline: false
                }
            )
            .setFooter({ text: "Auto-Claim Bot • Hoyolab & Endfield" })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error("Help command failed:", error);
        try {
            await interaction.reply({
                content: "❌ An error occurred while displaying the help menu.",
                flags: MessageFlags.Ephemeral
            });
        } catch (e) {
            console.error("Failed to send error reply:", e);
        }
    }
}
