/**
 * Crunchyroll Subtitle Download Command
 * Download subtitles from Crunchyroll episodes
 */

import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    type AutocompleteInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ComponentType,
    AttachmentBuilder,
    MessageFlags
} from "discord.js";
import { CrunchyrollService, CrunchyrollStreamLimitError } from "../services/crunchyroll";
import type { CrunchyrollEpisode, CrunchyrollSubtitle } from "../types/crunchyroll";
import { LANG_MAP, CRUNCHYROLL_COLOR } from "../constants";
import { logger } from "../core/logger";

const service = new CrunchyrollService();

/**
 * Standard Intl display name formatters for auto-detecting language names
 */
const displayNamesEn = new Intl.DisplayNames(["en"], { type: "language" });
const displayNamesId = new Intl.DisplayNames(["id"], { type: "language" });

/**
 * Reverse lookup: language input (code, English name, Indonesian name) → Crunchyroll locale code.
 * Auto-detected dynamically using standard ECMAScript Internationalization API (Intl).
 *
 * @param name - Language name or code (e.g. "id-ID", "indonesia", "Japanese", "de")
 * @returns Crunchyroll locale code or null if invalid
 */
export function langNameToCode(name: string): string | null {
    if (!name) return null;

    let clean = name.trim().toLowerCase();
    // Strip common language prefixes like "bahasa " (e.g. "bahasa indonesia" -> "indonesia")
    if (clean.startsWith("bahasa ")) {
        clean = clean.replace(/^bahasa\s+/, "").trim();
    }

    // 1. Direct match on LANG_MAP keys (e.g. "id-ID" or "id-id")
    const mapKey = Object.keys(LANG_MAP).find(k => k.toLowerCase() === clean);
    if (mapKey) return mapKey;

    // 2. Prefix match on locale code keys (e.g. "id" -> "id-ID")
    const prefixMatch = Object.keys(LANG_MAP).find(k => k.toLowerCase().startsWith(`${clean}-`));
    if (prefixMatch) return prefixMatch;

    // 3. Match on LANG_MAP values
    const mapVal = Object.entries(LANG_MAP).find(([, v]) => v.toLowerCase() === clean);
    if (mapVal) return mapVal[0];

    // Special Chinese variants
    if (clean === "mandarin") return "zh-CN";
    if (clean === "cantonese") return "zh-HK";

    // 4. Auto-detect via Intl.DisplayNames across all known LANG_MAP codes (English and Indonesian names)
    for (const code of Object.keys(LANG_MAP)) {
        try {
            const loc = new Intl.Locale(code);
            const enFull = displayNamesEn.of(code)?.toLowerCase();
            const enBase = displayNamesEn.of(loc.language)?.toLowerCase();
            const idFull = displayNamesId.of(code)?.toLowerCase();
            const idBase = displayNamesId.of(loc.language)?.toLowerCase();

            if (clean === enFull || clean === enBase || clean === idFull || clean === idBase) {
                return code;
            }
        } catch {
            // Ignore
        }
    }

    // 5. Match using Intl.Locale language subtag against available LANG_MAP keys
    try {
        const inputLocale = new Intl.Locale(clean);
        const localeMatch = Object.keys(LANG_MAP).find(k => {
            try {
                return new Intl.Locale(k).language === inputLocale.language;
            } catch {
                return false;
            }
        });
        if (localeMatch) return localeMatch;
    } catch {
        // Not a valid BCP-47 tag, continue
    }

    return null;
}

interface ParsedUrl {
    type: "episode" | "series";
    id: string;
}

/** Extract episode or series ID from Crunchyroll URL */
export function parseCrunchyrollUrl(input: string): ParsedUrl | null {
    // Direct ID format (e.g., GEXH3WP91)
    if (/^[A-Z0-9]{9,}$/.test(input)) return { type: "episode", id: input };

    // URL format: https://www.crunchyroll.com/watch/GEXH3WP91/... or https://www.crunchyroll.com/id/watch/GE00377807JAJP/...
    let match = input.match(/crunchyroll\.com\/(?:[a-z0-9_-]+\/)?watch\/([A-Z0-9]+)/i);
    if (match) return { type: "episode", id: match[1]! };

    // Series URL format: https://www.crunchyroll.com/series/GT00365589/... or https://www.crunchyroll.com/id/series/GT00365589/...
    match = input.match(/crunchyroll\.com\/(?:[a-z0-9_-]+\/)?series\/([A-Z0-9]+)/i);
    if (match) return { type: "series", id: match[1]! };

    return null;
}

/**
 * Slash command data for the subcr command.
 */
export const data = new SlashCommandBuilder()
    .setName("subcr")
    .setDescription("Download subtitles from Crunchyroll episodes")
    .addStringOption(opt => opt.setName("url").setDescription("Crunchyroll episode URL or ID").setRequired(false))
    .addStringOption(opt =>
        opt.setName("anime").setDescription("Anime title (Romaji or English)").setRequired(false).setAutocomplete(true)
    )
    .addIntegerOption(opt =>
        opt.setName("episode").setDescription("Select episode number").setRequired(false).setMinValue(1)
    )
    .addStringOption(opt =>
        opt
            .setName("lang")
            .setDescription("Select subtitle language (automatically tailored per anime)")
            .setRequired(false)
            .setAutocomplete(true)
    );

/**
 * In-memory cache for available subtitle languages per anime/series/episode.
 */
const subtitleLangCache = new Map<string, { codes: string[]; expiry: number }>();
const SUB_LANG_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Fetches available subtitle language codes for a given anime title or URL.
 * @param animeInput - Anime title input
 * @param urlInput - Episode or series URL/ID
 * @param episodeNumber - Optional episode number
 * @returns Array of subtitle locale codes (excluding Japanese ja-JP)
 */
export async function fetchAvailableSubtitleLangs(
    animeInput: string | null,
    urlInput: string | null,
    episodeNumber?: number | null
): Promise<string[]> {
    const key = `${urlInput || ""}:${animeInput || ""}:${episodeNumber || ""}`;
    const cached = subtitleLangCache.get(key);
    if (cached && Date.now() < cached.expiry) {
        return cached.codes;
    }

    let episodeId: string | null = null;

    try {
        if (urlInput) {
            const parsed = parseCrunchyrollUrl(urlInput);
            if (parsed) {
                if (parsed.type === "series") {
                    const episodes = await service.fetchEpisodesBySeriesId(parsed.id, episodeNumber ?? undefined);
                    if (episodes.length > 0) {
                        const targetEp = episodes[0];
                        if (targetEp?.subtitle_locales && targetEp.subtitle_locales.length > 0) {
                            const codes = targetEp.subtitle_locales.filter(c => c !== "ja-JP");
                            subtitleLangCache.set(key, { codes, expiry: Date.now() + SUB_LANG_CACHE_TTL });
                            return codes;
                        }
                        episodeId = targetEp!.id;
                    }
                } else {
                    episodeId = parsed.id;
                }
            }
        } else if (animeInput) {
            const episodes = await service.searchEpisode(animeInput, episodeNumber ?? undefined);
            if (episodes.length > 0) {
                const targetEp = episodes[0];
                if (targetEp?.subtitle_locales && targetEp.subtitle_locales.length > 0) {
                    const codes = targetEp.subtitle_locales.filter(c => c !== "ja-JP");
                    subtitleLangCache.set(key, { codes, expiry: Date.now() + SUB_LANG_CACHE_TTL });
                    return codes;
                }
                episodeId = targetEp!.id;
            }
        }

        if (!episodeId) return [];

        // For direct episode ID/URL without series metadata, fetch lightweight CMS metadata
        // to avoid calling play service and exhausting stream limits during autocomplete
        const cmsLocales = await service.fetchEpisodeSubtitleLocales(episodeId);
        if (cmsLocales.length > 0) {
            const codes = cmsLocales.filter(c => c !== "ja-JP");
            subtitleLangCache.set(key, { codes, expiry: Date.now() + SUB_LANG_CACHE_TTL });
            return codes;
        }

        return [];
    } catch (error) {
        logger.error(error as Error, "Error fetching available subtitle languages");
        return [];
    }
}

/**
 * Autocomplete handler for selecting series and subtitle language in subcr command.
 *
 * @param interaction Autocomplete interaction.
 * @returns A promise that resolves when autocomplete is handled.
 */
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === "anime") {
        const focusedValue = String(focusedOption.value || "");
        if (!focusedValue) {
            await interaction.respond([]);
            return;
        }

        try {
            const results = await service.searchSeriesAutocomplete(focusedValue);
            await interaction.respond(results);
        } catch (error) {
            logger.error(error, "Anime autocomplete error");
            await interaction.respond([]);
        }
        return;
    }

    if (focusedOption.name === "lang") {
        const query = String(focusedOption.value || "")
            .toLowerCase()
            .trim();
        const animeInput = interaction.options.getString("anime");
        const urlInput = interaction.options.getString("url");
        const episodeInput = interaction.options.getInteger("episode");

        try {
            let availableCodes: string[] = [];

            if (animeInput || urlInput) {
                availableCodes = await fetchAvailableSubtitleLangs(animeInput, urlInput, episodeInput);
            }

            // If we found anime-specific languages, use them; otherwise fall back to common LANG_MAP codes
            const baseCodes =
                availableCodes.length > 0 ? availableCodes : Object.keys(LANG_MAP).filter(code => code !== "ja-JP");

            const choices = baseCodes
                .map(code => {
                    const name = LANG_MAP[code] || code;
                    return {
                        name: `${name} (${code})`.substring(0, 100),
                        value: code
                    };
                })
                .filter(choice => {
                    if (!query) return true;
                    return choice.name.toLowerCase().includes(query) || choice.value.toLowerCase().includes(query);
                })
                .slice(0, 25);

            await interaction.respond(choices);
        } catch (error) {
            logger.error(error, "Lang autocomplete error");
            await interaction.respond([]);
        }
        return;
    }

    await interaction.respond([]);
}

/**
 * Executes the subcr command to query and download subtitles from Crunchyroll.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
 */
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
            content: "❌ Must provide either `url` (episode URL/ID) or `anime` (anime title).",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply();

    try {
        let episodeId: string | null = null;
        let episodeTitle = "";
        let episodes: CrunchyrollEpisode[] = [];

        if (urlInput) {
            // Mode 1: Direct URL/ID or Series URL
            const parsed = parseCrunchyrollUrl(urlInput);
            if (!parsed) {
                await interaction.editReply({
                    content:
                        "❌ Invalid URL/ID. Example: `https://www.crunchyroll.com/watch/GEXH3WP91/...` or `https://www.crunchyroll.com/series/GT00365589`"
                });
                return;
            }

            if (parsed.type === "series") {
                episodes = await service.fetchEpisodesBySeriesId(parsed.id, episodeInput ?? undefined);
                if (episodes.length === 0) {
                    await interaction.editReply({
                        content: episodeInput
                            ? `❌ Episode **${episodeInput}** not found for this series.`
                            : `❌ No episodes found for this series.`
                    });
                    return;
                }
            } else {
                episodeId = parsed.id;
                episodeTitle = episodeId;
            }
        } else if (animeInput) {
            // Mode 2: Search by anime title + optional episode number
            episodes = await service.searchEpisode(animeInput, episodeInput ?? undefined);
            if (episodes.length === 0) {
                await interaction.editReply({
                    content: episodeInput
                        ? `❌ Episode **${episodeInput}** not found for anime "**${animeInput}**".`
                        : `❌ No episodes found for anime "**${animeInput}**".`
                });
                return;
            }
        }

        // Feature: Interactive Episode Selection
        if (!episodeId) {
            if (!episodeInput && episodes.length > 1) {
                // Determine series title safely
                const firstEp = episodes[0]!;
                const baseTitle = firstEp.episode_metadata?.series_title || animeInput || "Series";

                const options = episodes.slice(0, 25).map(ep => {
                    const epNumStr = ep.episode || ep.episode_number || "?";
                    return {
                        label: `Episode ${epNumStr}`.substring(0, 100),
                        description: (ep.title || baseTitle).substring(0, 100),
                        value: ep.id
                    };
                });

                const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("select_episode")
                        .setPlaceholder("Select Episode...")
                        .addOptions(options)
                );

                const reply = await interaction.editReply({
                    content: `Multiple episodes found for anime **${baseTitle}**. Please select below:`,
                    components: [row]
                });

                try {
                    const confirmation = await reply.awaitMessageComponent({
                        filter: i => i.user.id === interaction.user.id && i.customId === "select_episode",
                        time: 60_000,
                        componentType: ComponentType.StringSelect
                    });

                    episodeId = confirmation.values[0]!;
                    const ep = episodes.find(e => e.id === episodeId)!;
                    episodeTitle = `${ep.episode_metadata?.series_title || baseTitle} - Episode ${ep.episode || ep.episode_number || "?"}`;
                    if (ep.title && !/^Episode\s+0*\d+$/i.test(ep.title)) {
                        episodeTitle += ` - ${ep.title}`;
                    }

                    await confirmation.update({
                        content: `⏳ Processing subtitles for **${episodeTitle}**...`,
                        components: []
                    });
                } catch {
                    await interaction.editReply({
                        content: "❌ Selection timed out. Please run the command again.",
                        components: []
                    });
                    return;
                }
            } else {
                // Auto-select the only/first episode
                const ep = episodes[0]!;
                episodeId = ep.id;
                episodeTitle = `${ep.episode_metadata?.series_title || animeInput || "Series"} - Episode ${ep.episode || ep.episode_number || episodeInput || "?"}`;
                if (ep.title && !/^Episode\s+0*\d+$/i.test(ep.title)) {
                    episodeTitle += ` - ${ep.title}`;
                }
            }
        }

        if (!episodeId) {
            await interaction.editReply({ content: "❌ Failed to determine episode ID." });
            return;
        }

        // Fetch available subtitles
        let subtitles: Record<string, CrunchyrollSubtitle> | null = null;
        try {
            subtitles = await service.fetchSubtitles(episodeId);
        } catch (err) {
            if (err instanceof CrunchyrollStreamLimitError) {
                await interaction.editReply({
                    content:
                        "⚠️ **Crunchyroll Stream Limit Reached** (`TOO_MANY_ACTIVE_STREAMS`).\n" +
                        "Akun Crunchyroll sedang memiliki sesi pemutaran aktif atau batas stream tercapai. Harap tunggu 1–2 menit agar sesi sebelumnya ditutup, lalu coba lagi."
                });
                return;
            }
            throw err;
        }

        if (!subtitles || Object.keys(subtitles).length === 0) {
            await interaction.editReply({
                content: "❌ No subtitles available for this episode. Ensure your Crunchyroll account is configured."
            });
            return;
        }

        // If language is specified, download directly
        if (langInput) {
            const sub = subtitles[langInput];
            if (!sub) {
                const available = Object.keys(subtitles)
                    .map(code => `\`${LANG_MAP[code] || code}\` (\`${code}\`)`)
                    .join(", ");
                await interaction.editReply({
                    content: `❌ Subtitle **${LANG_MAP[langInput] || langInput}** (\`${langInput}\`) is not available.\nAvailable subtitles: ${available}`
                });
                return;
            }

            await downloadAndSend(interaction, sub.url, episodeId, langInput, episodeTitle, sub.format);
            return;
        }

        // No language specified — if only 1 non-Japanese subtitle is available, automatically download it!
        const nonJpSubtitles = Object.entries(subtitles).filter(([code]) => code !== "ja-JP");
        if (nonJpSubtitles.length === 1) {
            const [autoLang, autoSub] = nonJpSubtitles[0]!;
            await downloadAndSend(interaction, autoSub.url, episodeId, autoLang, episodeTitle, autoSub.format);
            return;
        }

        // Multiple subtitles available — show select menu
        const subEntries = nonJpSubtitles.length > 0 ? nonJpSubtitles : Object.entries(subtitles);
        const options = subEntries.slice(0, 25).map(([code, sub]) => ({
            label: LANG_MAP[code] || code,
            description: `${sub.format.toUpperCase()} • ${code}`,
            value: code
        }));

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`subcr_lang_${episodeId}`)
            .setPlaceholder("Select subtitle language...")
            .addOptions(options);

        const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);

        const embed = new EmbedBuilder()
            .setColor(CRUNCHYROLL_COLOR)
            .setTitle("📝 Select Subtitle Language")
            .setDescription(
                `**${episodeTitle}**\n\n` +
                    `Available in **${subEntries.length}** subtitle languages.\n` +
                    `Select the language you want to download:`
            )
            .setFooter({ text: "Selection valid for 60 seconds" });

        const reply = await interaction.editReply({
            content: "",
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
                content: "",
                components: [],
                embeds: [
                    embed
                        .setDescription("⏰ Time expired. Use `/subcr` again to download subtitles.")
                        .setColor(0x808080)
                ]
            });
        }
    } catch (error) {
        logger.error(error, "Subcr command error");
        await interaction.editReply({
            content: "❌ An error occurred while fetching subtitles. Please try again later."
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
    try {
        const content = await service.downloadSubtitle(url);
        if (!content) {
            await interaction.editReply({
                content: "❌ Failed to download subtitle file.",
                components: []
            });
            return;
        }

        // Build filename: EpisodeID_lang.ass (convert .txt format label to .ass)
        const normalizedFormat = format === "txt" ? "ass" : format;
        const ext = normalizedFormat === "vtt" ? "vtt" : normalizedFormat === "srt" ? "srt" : "ass";
        const filename = `${episodeId}_${lang}.${ext}`;

        // Create attachment from buffer (no temp file needed)
        const buffer = Buffer.from(content, "utf-8");
        const attachment = new AttachmentBuilder(buffer, { name: filename });

        const embed = new EmbedBuilder()
            .setColor(CRUNCHYROLL_COLOR)
            .setTitle("✅ Subtitle Downloaded")
            .setDescription(
                `**${episodeTitle}**\n\n` +
                    `🌐 Language: **${LANG_MAP[lang] || lang}** (\`${lang}\`)\n` +
                    `📄 Format: **${normalizedFormat.toUpperCase()}**\n` +
                    `📦 File: \`${filename}\``
            )
            .setFooter({ text: "Crunchyroll Subtitle Downloader" })
            .setTimestamp();

        await interaction.editReply({
            content: "",
            embeds: [embed],
            files: [attachment],
            components: []
        });
    } catch (error) {
        logger.error(error, "downloadAndSend failed");
        await interaction.editReply({
            content: "❌ Failed to download and send subtitle file.",
            components: []
        });
    }
}
