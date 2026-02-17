/**
 * Help Command
 * Display usage instructions for all bot features
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { ENDFIELD } from "../constants";

export const data = new SlashCommandBuilder().setName("help").setDescription("Show how to use this bot");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
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
                name: "🎮 Endfield Token (2 token diperlukan)",
                value: [
                    "Buka https://game.skport.com/endfield/sign-in dan login",
                    "",
                    "**Cara 1: Pakai Script (Recommended)**",
                    "1. Tekan F12 → tab **Console**",
                    "2. Paste dan jalankan script di bawah",
                    "3. Copy kedua nilai yang muncul"
                ].join("\n"),
                inline: false
            },
            {
                name: "📋 getEndfield.js Script",
                value:
                    "```js\n" +
                    "// Jalankan di console game.skport.com/endfield/sign-in\n" +
                    'function gc(n){const v=`; ${document.cookie}`;const p=v.split(`; ${n}=`);if(p.length===2)return p.pop().split(";").shift()}\n' +
                    "// Token 1: dari Cookie\n" +
                    'let cred=gc("SK_OAUTH_CRED_KEY")||"Not found";\n' +
                    "// Token 2: dari Local Storage\n" +
                    'let token=localStorage.getItem("SK_TOKEN_CACHE_KEY")||"Not found";\n' +
                    'console.log("SK_OAUTH_CRED_KEY:",cred);\n' +
                    'console.log("SK_TOKEN_CACHE_KEY:",token);\n' +
                    "```",
                inline: false
            },
            {
                name: "📋 Cara 2: Manual",
                value: [
                    "**SK_OAUTH_CRED_KEY:**",
                    "F12 → **Application** → **Cookies** → `game.skport.com` → copy `SK_OAUTH_CRED_KEY`",
                    "",
                    "**SK_TOKEN_CACHE_KEY:**",
                    "F12 → **Application** → **Local Storage** → `game.skport.com` → copy `SK_TOKEN_CACHE_KEY`"
                ].join("\n"),
                inline: false
            },
            {
                name: "📝 Endfield Setup Info",
                value: [
                    "• **SK_OAUTH_CRED_KEY**: Token dari Cookie (autentikasi)",
                    "• **SK_TOKEN_CACHE_KEY**: Token dari Local Storage (untuk signing)",
                    "• **Game UID**: UID dari profil in-game",
                    `• **Server**: 2 = ${ENDFIELD.servers["2"]}, 3 = ${ENDFIELD.servers["3"]}`,
                    "",
                    "⚠️ *Token bisa expired (kode 10000), jalankan ulang script dan update via `/setup-endfield`*"
                ].join("\n"),
                inline: false
            },
            {
                name: "⏰ Auto-Claim Schedule",
                value: "Daily rewards akan di-claim otomatis setiap **00:00 UTC+8** (tengah malam).",
                inline: false
            }
        )
        .setFooter({ text: "Auto-Claim Bot • Hoyolab & Endfield" })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}
