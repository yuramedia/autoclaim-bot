/**
 * Crunchyroll Subtitle Download Command
 * Download subtitles from Crunchyroll episodes
 */

import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    AttachmentBuilder
} from "discord.js";
import { CrunchyrollService } from "../services/crunchyroll";
import { LANG_MAP, CRUNCHYROLL_COLOR } from "../constants";

const service = new CrunchyrollService();

/** Reverse lookup: language name → locale code */
function langNameToCode(name: string): string | null {
    const entry = Object.entries(LANG_MAP).find(([, v]) => v.toLowerCase() === name.toLowerCase());
    return entry?.[0] || null;
}

/** Extract episode ID from Crunchyroll URL */
function parseEpisodeId(input: string): string | null {
    // Direct ID format (e.g., GEXH3WP91)
    if (/^[A-Z0-9]{9,}$/.test(input)) return input;

    // URL format: https://www.crunchyroll.com/watch/GEXH3WP91/...
    const match = input.match(/crunchyroll\.com\/watch\/([A-Z0-9]+)/i);
    return match?.[1] || null;
}

export const data = new SlashCommandBuilder()
    .setName("subcr")
    .setDescription("Download subtitle dari episode Crunchyroll")
    .addStringOption(opt => opt.setName("url").setDescription("URL atau ID episode Crunchyroll").setRequired(false))
    .addStringOption(opt => opt.setName("anime").setDescription("Judul anime (romaji atau English)").setRequired(false))
    .addIntegerOption(opt =>
        opt.setName("episode").setDescription("Pilih Nomor episode").setRequired(false).setMinValue(1)
    )
    .addStringOption(opt =>
        opt
            .setName("lang")
            .setDescription("Pilih subtitle")
            .setRequired(false)
            .addChoices(
                ...Object.entries(LANG_MAP)
                    .filter(([code]) => code !== "ja-JP")
                    .slice(0, 25)
                    .map(([, name]) => ({ name, value: name }))
            )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const urlInput = interaction.options.getString("url");
    const animeInput = interaction.options.getString("anime");
    const episodeInput = interaction.options.getInteger("episode");
    const langRaw = interaction.options.getString("lang");
    // Resolve language name to locale code (e.g. "Indonesian" → "id-ID")
    const langInput = langRaw ? langNameToCode(langRaw) || langRaw : null;

    // Validate: must provide either URL or anime title
    if (!urlInput && !animeInput) {
        await interaction.reply({
            content: "❌ Harus mengisi salah satu: `url` (link/ID episode) atau `anime` (judul anime).",
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply();

    try {
        let episodeId: string | null = null;
        let episodeTitle = "";

        if (urlInput) {
            // Mode 1: Direct URL/ID
            episodeId = parseEpisodeId(urlInput);
            if (!episodeId) {
                await interaction.editReply({
                    content:
                        "❌ URL/ID tidak valid. Contoh: `https://www.crunchyroll.com/watch/GEXH3WP91/...` atau `GEXH3WP91`"
                });
                return;
            }
            episodeTitle = episodeId;
        } else if (animeInput) {
            // Mode 2: Search by anime title + episode number
            if (!episodeInput) {
                await interaction.editReply({
                    content: "❌ Harus mengisi nomor `episode` jika mencari berdasarkan judul anime."
                });
                return;
            }

            const episodes = await service.searchEpisode(animeInput, episodeInput);
            if (episodes.length === 0) {
                await interaction.editReply({
                    content: `❌ Tidak ditemukan episode **${episodeInput}** untuk anime "**${animeInput}**".`
                });
                return;
            }

            const ep = episodes[0]!;
            episodeId = ep.id;
            episodeTitle = `${ep.episode_metadata?.series_title || animeInput} - Episode ${ep.episode_metadata?.episode || episodeInput}`;
            if (ep.title && !/^Episode\s+0*\d+$/i.test(ep.title)) {
                episodeTitle += ` - ${ep.title}`;
            }
        }

        if (!episodeId) {
            await interaction.editReply({ content: "❌ Gagal menentukan episode ID." });
            return;
        }

        // Fetch available subtitles
        const subtitles = await service.fetchSubtitles(episodeId);
        if (!subtitles || Object.keys(subtitles).length === 0) {
            await interaction.editReply({
                content:
                    "❌ Tidak ada subtitle yang tersedia untuk episode ini. Pastikan akun Crunchyroll sudah dikonfigurasi."
            });
            return;
        }

        // If language is specified, download directly
        if (langInput) {
            const sub = subtitles[langInput];
            if (!sub) {
                const available = Object.keys(subtitles)
                    .map(code => `\`${LANG_MAP[code] || code}\``)
                    .join(", ");
                await interaction.editReply({
                    content: `❌ Subtitle **${LANG_MAP[langInput] || langInput}** tidak tersedia.\nSubtitle yang ada: ${available}`
                });
                return;
            }

            await downloadAndSend(interaction, sub.url, episodeId, langInput, episodeTitle, sub.format);
            return;
        }

        // No language specified — show select menu
        const subEntries = Object.entries(subtitles);
        const options = subEntries.slice(0, 25).map(([code, sub]) => ({
            label: LANG_MAP[code] || code,
            description: `${sub.format.toUpperCase()} • ${code}`,
            value: code
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`subcr_lang_${episodeId}`)
            .setPlaceholder("Pilih bahasa subtitle...")
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setColor(CRUNCHYROLL_COLOR)
            .setTitle("📝 Pilih Bahasa Subtitle")
            .setDescription(
                `**${episodeTitle}**\n\n` +
                    `Tersedia **${subEntries.length}** bahasa subtitle.\n` +
                    `Pilih bahasa yang ingin didownload:`
            )
            .setFooter({ text: "Pilihan berlaku selama 60 detik" });

        const reply = await interaction.editReply({
            embeds: [embed],
            components: [row]
        });

        // Wait for selection
        try {
            const selection = await reply.awaitMessageComponent({
                componentType: ComponentType.StringSelect,
                time: 60_000,
                filter: i => i.user.id === interaction.user.id
            });

            await selection.deferUpdate();

            const selectedLang = selection.values[0]!;
            const sub = subtitles[selectedLang]!;

            await downloadAndSend(interaction, sub.url, episodeId, selectedLang, episodeTitle, sub.format);
        } catch {
            // Timeout — remove components
            await interaction.editReply({
                components: [],
                embeds: [
                    embed
                        .setDescription("⏰ Waktu habis. Gunakan `/subcr` lagi untuk mendownload subtitle.")
                        .setColor(0x808080)
                ]
            });
        }
    } catch (error) {
        console.error("Subcr command error:", error);
        await interaction.editReply({
            content: "❌ Terjadi kesalahan saat mengambil subtitle. Coba lagi nanti."
        });
    }
}

/**
 * Download subtitle and send as Discord attachment
 * File is kept in memory (Buffer) — no temp files on disk
 */
async function downloadAndSend(
    interaction: ChatInputCommandInteraction,
    url: string,
    episodeId: string,
    lang: string,
    episodeTitle: string,
    format: string
): Promise<void> {
    const content = await service.downloadSubtitle(url);
    if (!content) {
        await interaction.editReply({
            content: "❌ Gagal mendownload file subtitle.",
            components: []
        });
        return;
    }

    // Build filename: EpisodeID_lang.ass
    const ext = format === "ass" ? "ass" : format === "vtt" ? "vtt" : "srt";
    const filename = `${episodeId}_${lang}.${ext}`;

    // Create attachment from buffer (no temp file needed)
    const buffer = Buffer.from(content, "utf-8");
    const attachment = new AttachmentBuilder(buffer, { name: filename });

    const embed = new EmbedBuilder()
        .setColor(CRUNCHYROLL_COLOR)
        .setTitle("✅ Subtitle Downloaded")
        .setDescription(
            `**${episodeTitle}**\n\n` +
                `🌐 Bahasa: **${LANG_MAP[lang] || lang}** (\`${lang}\`)\n` +
                `📄 Format: **${format.toUpperCase()}**\n` +
                `📦 File: \`${filename}\``
        )
        .setFooter({ text: "Crunchyroll Subtitle Downloader" })
        .setTimestamp();

    await interaction.editReply({
        embeds: [embed],
        files: [attachment],
        components: []
    });
}
