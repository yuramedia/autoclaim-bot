/**
 * Crunchyroll Release Command
 * View seasonal anime releases from Crunchyroll
 */

import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    type AutocompleteInteraction,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} from "discord.js";
import { CrunchyrollService } from "../services/crunchyroll";
import { CRUNCHYROLL_COLOR, CR_SEASONS, CR_RELEASE_ITEMS_PER_PAGE, CR_SEASON_CACHE_TTL } from "../constants";
import type { CrunchyrollBrowseItem } from "../types/crunchyroll";

const service = new CrunchyrollService();

/** Cache for valid seasons (avoid re-checking the API) */
const VALID_SEASONS_CACHE: { seasons: string[]; expiresAt: number } = {
    seasons: [],
    expiresAt: 0
};

/**
 * Get the current season index from a month (0-11)
 */
function getSeasonIndex(month: number): number {
    if (month <= 2) return 0; // Winter (Jan-Mar)
    if (month <= 5) return 1; // Spring (Apr-Jun)
    if (month <= 8) return 2; // Summer (Jul-Sep)
    return 3; // Fall (Oct-Dec)
}

/**
 * Generate candidate season tags around the current date
 * Returns ~8 candidates: 2 past + current + 5 future
 */
function generateCandidateSeasons(): { tag: string; label: string }[] {
    const now = new Date();
    const currentSeasonIdx = getSeasonIndex(now.getMonth());
    let year = now.getFullYear();

    const candidates: { tag: string; label: string }[] = [];

    // Start from 2 seasons before current
    let startIdx = currentSeasonIdx - 2;
    let startYear = year;
    if (startIdx < 0) {
        startIdx += 4;
        startYear--;
    }

    // Generate 8 seasons (2 past + current + 5 future)
    let idx = startIdx;
    let y = startYear;
    for (let i = 0; i < 8; i++) {
        const season = CR_SEASONS[idx]!;
        const label = `${season.charAt(0).toUpperCase() + season.slice(1)} ${y}`;
        candidates.push({ tag: `${season}-${y}`, label });

        idx++;
        if (idx >= 4) {
            idx = 0;
            y++;
        }
    }

    return candidates;
}

/**
 * Fetch valid seasons from the API (with caching)
 * Only returns seasons that actually have content on Crunchyroll
 */
async function getValidSeasons(): Promise<{ tag: string; label: string }[]> {
    if (VALID_SEASONS_CACHE.seasons.length > 0 && Date.now() < VALID_SEASONS_CACHE.expiresAt) {
        const candidates = generateCandidateSeasons();
        return candidates.filter(c => VALID_SEASONS_CACHE.seasons.includes(c.tag));
    }

    const candidates = generateCandidateSeasons();

    // Check each candidate concurrently
    const results = await Promise.all(
        candidates.map(async c => {
            const items = await service.fetchSeasonalSeries(c.tag);
            return { tag: c.tag, hasData: items.length > 0 };
        })
    );

    const validSeasons = results.filter(r => r.hasData).map(r => r.tag);

    // Update cache
    VALID_SEASONS_CACHE.seasons = validSeasons;
    VALID_SEASONS_CACHE.expiresAt = Date.now() + CR_SEASON_CACHE_TTL;

    return candidates.filter(c => VALID_SEASONS_CACHE.seasons.includes(c.tag));
}

/**
 * Build paginated embeds for a list of series
 */
function buildEmbed(
    series: CrunchyrollBrowseItem[],
    seasonLabel: string,
    page: number,
    totalPages: number
): EmbedBuilder {
    const start = page * CR_RELEASE_ITEMS_PER_PAGE;
    const end = Math.min(start + CR_RELEASE_ITEMS_PER_PAGE, series.length);
    const pageItems = series.slice(start, end);

    const embed = new EmbedBuilder()
        .setColor(CRUNCHYROLL_COLOR)
        .setTitle(`📺 Crunchyroll — ${seasonLabel}`)
        .setDescription(`Menampilkan **${series.length}** anime untuk season ini.`)
        .setTimestamp()
        .setFooter({
            text: `Halaman ${page + 1}/${totalPages} • Data dari Crunchyroll`
        });

    for (const item of pageItems) {
        const meta = item.series_metadata;
        const isSimulcast = meta?.is_simulcast ? "🟢 Simulcast" : "📦 Non-Simulcast";
        const episodeCount = meta?.episode_count ? `${meta.episode_count} eps` : "TBA";
        const url = `https://www.crunchyroll.com/series/${item.id}/${item.slug_title}`;

        embed.addFields({
            name: item.title,
            value: `${isSimulcast} • ${episodeCount}\n[Lihat di Crunchyroll](${url})`,
            inline: false
        });
    }

    // Set thumbnail from first item's poster
    const poster = pageItems[0]?.images?.poster_tall;
    if (poster && poster.length > 0) {
        const imageGroup = poster[poster.length - 1];
        if (imageGroup && imageGroup.length > 0) {
            const sorted = [...imageGroup].toSorted((a, b) => b.height - a.height);
            if (sorted[0]?.source) {
                embed.setThumbnail(sorted[0].source);
            }
        }
    }

    return embed;
}

/**
 * Build navigation buttons
 */
function buildButtons(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId("crrelease_prev")
            .setLabel("◀ Prev")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId("crrelease_page")
            .setLabel(`${page + 1} / ${totalPages}`)
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId("crrelease_next")
            .setLabel("Next ▶")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1)
    );
}

// Command definition
export const data = new SlashCommandBuilder()
    .setName("crrelease")
    .setDescription("Lihat daftar anime rilis per season di Crunchyroll")
    .addStringOption(opt =>
        opt
            .setName("season")
            .setDescription("Pilih season (contoh: Spring 2026)")
            .setRequired(true)
            .setAutocomplete(true)
    );

/**
 * Autocomplete handler — returns only seasons that exist on Crunchyroll
 */
export async function autocomplete(interaction: AutocompleteInteraction): Promise<void> {
    const focused = interaction.options.getFocused().toLowerCase();

    try {
        const validSeasons = await getValidSeasons();

        const filtered = validSeasons
            .filter(s => s.label.toLowerCase().includes(focused) || s.tag.includes(focused))
            .slice(0, 25);

        await interaction.respond(filtered.map(s => ({ name: s.label, value: s.tag })));
    } catch (error) {
        console.error("Crrelease autocomplete error:", error);
        // Fallback: show candidates without validation
        const candidates = generateCandidateSeasons();
        const filtered = candidates
            .filter(s => s.label.toLowerCase().includes(focused) || s.tag.includes(focused))
            .slice(0, 25);
        await interaction.respond(filtered.map(s => ({ name: s.label, value: s.tag })));
    }
}

/**
 * Execute command
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const seasonTag = interaction.options.getString("season", true);

    // Validate format
    if (!/^(winter|spring|summer|fall)-\d{4}$/.test(seasonTag)) {
        await interaction.editReply({
            content: "❌ Format season tidak valid. Gunakan autocomplete untuk memilih season."
        });
        return;
    }

    try {
        const series = await service.fetchSeasonalSeries(seasonTag);

        if (series.length === 0) {
            await interaction.editReply({
                content: `❌ Tidak ada anime di season **${seasonTag}** atau season ini belum tersedia di Crunchyroll.`
            });
            return;
        }

        // Sort alphabetically
        series.sort((a, b) => a.title.localeCompare(b.title));

        const seasonLabel = seasonTag
            .split("-")
            .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
            .join(" ");

        const totalPages = Math.ceil(series.length / CR_RELEASE_ITEMS_PER_PAGE);
        let currentPage = 0;

        const embed = buildEmbed(series, seasonLabel, currentPage, totalPages);
        const components = totalPages > 1 ? [buildButtons(currentPage, totalPages)] : [];

        const reply = await interaction.editReply({
            embeds: [embed],
            components
        });

        if (totalPages <= 1) return;

        // Handle pagination (2 minutes timeout)
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120_000,
            filter: i => i.user.id === interaction.user.id
        });

        collector.on("collect", async buttonInteraction => {
            if (buttonInteraction.customId === "crrelease_prev") {
                currentPage = Math.max(0, currentPage - 1);
            } else if (buttonInteraction.customId === "crrelease_next") {
                currentPage = Math.min(totalPages - 1, currentPage + 1);
            }

            const newEmbed = buildEmbed(series, seasonLabel, currentPage, totalPages);
            const newButtons = buildButtons(currentPage, totalPages);

            await buttonInteraction.update({
                embeds: [newEmbed],
                components: [newButtons]
            });
        });

        collector.on("end", async () => {
            try {
                await interaction.editReply({ components: [] });
            } catch {
                // Message may have been deleted
            }
        });
    } catch (error) {
        console.error("Crrelease command error:", error);
        await interaction.editReply({
            content: "❌ Terjadi kesalahan saat mengambil data. Coba lagi nanti."
        });
    }
}
