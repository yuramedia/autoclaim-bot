/**
 * Best Release Command
 * Search for best Indonesian subtitle releases for anime
 */

import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import type { AnimeRelease, AnimeEntry } from "../types/bestrelease";
import { logger } from "../core/logger";
import { fetchWithTimeout } from "../utils/http";

/**
 * Slash command data for the bestrelease command.
 */
export const data = new SlashCommandBuilder()
    .setName("bestrelease")
    .setDescription("Search for best subtitle releases for anime")
    .addStringOption(opt => opt.setName("anime").setDescription("Anime title to search for").setRequired(true));

/**
 * Executes the bestrelease command to search for subtitle releases.
 *
 * @param interaction The command interaction from Discord.
 * @returns A promise that resolves when the command is executed.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const query = interaction.options.getString("anime", true).toLowerCase();

    try {
        const response = await fetchWithTimeout("https://best-release.kazeuta.com/__data.json", { timeoutMs: 15000 });
        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const json = (await response.json()) as { nodes?: { data?: unknown[] }[] };

        // Parse the SvelteKit data format
        const animeList = parseApiData(json);

        // Search for matching anime
        const results = animeList.filter(anime => {
            const title = anime.title?.toLowerCase() || "";
            const titleEng = anime.title_english?.toLowerCase() || "";
            const titleJp = anime.title_japanese?.toLowerCase() || "";
            return title.includes(query) || titleEng.includes(query) || titleJp.includes(query);
        });

        if (results.length === 0) {
            await interaction.editReply({
                content: `❌ No anime found matching keyword: **${query}**`
            });
            return;
        }

        // Limit to first 5 results
        const displayResults = results.slice(0, 5);

        const embed = new EmbedBuilder()
            .setTitle("🎬 Best Anime Releases")
            .setDescription(`Search results for: **${query}**`)
            .setColor(0x3498db)
            .setTimestamp()
            .setFooter({
                text: `Showing ${displayResults.length} of ${results.length} results • Data from best-release.kazeuta.com`
            });

        for (const anime of displayResults) {
            const title = anime.title_english || anime.title;
            const releases = anime.releases || [];

            let releaseInfo = "";
            if (releases.length > 0) {
                releaseInfo = releases
                    .slice(0, 3)
                    .map(r => {
                        const desc = r.description ? ` (${r.description})` : "";
                        const links =
                            r.download_links && r.download_links.length > 0
                                ? ` [Download](${r.download_links[0]})`
                                : "";
                        return `• ${r.name}${desc}${links}`;
                    })
                    .join("\n");

                if (releases.length > 3) {
                    releaseInfo += `\n*... and ${releases.length - 3} more releases*`;
                }
            } else {
                releaseInfo = "*No releases yet*";
            }

            // Notes if any
            const notes = anime.notes ? `\n📝 *${anime.notes.split("\n")[0]}*` : "";
            const fieldVal = `${releaseInfo}${notes}\n[Link](https://best-release.kazeuta.com/anime/${anime.mal_id})`;

            embed.addFields({
                name: (title || "Untitled").slice(0, 256),
                value: fieldVal.length > 1024 ? fieldVal.slice(0, 1020) + "..." : fieldVal,
                inline: false
            });
        }

        // Set thumbnail from first result
        if (displayResults[0]?.image_url) {
            embed.setThumbnail(displayResults[0].image_url);
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error(error, "Best release error");
        await interaction.editReply({
            content: "❌ An error occurred while searching for data. Please try again later."
        });
    }
}

function parseApiData(json: { nodes?: { data?: unknown[] }[] }): AnimeEntry[] {
    const animeList: AnimeEntry[] = [];

    try {
        // SvelteKit data format stores values in a flat array with indices
        const node = json.nodes?.[1];
        if (!node?.data) return [];

        const nodeData = node.data as unknown[];

        // Find the anime array indices (second element in data array)
        const animeIndices = nodeData[1] as number[];
        if (!Array.isArray(animeIndices)) return [];

        for (const idx of animeIndices) {
            const entry = nodeData[idx] as Record<string, number>;
            if (!entry) continue;

            const anime: AnimeEntry = {
                id: resolveValue(nodeData, entry.id) as number,
                mal_id: resolveValue(nodeData, entry.mal_id) as number,
                title: resolveValue(nodeData, entry.title) as string,
                title_english: resolveValue(nodeData, entry.title_english) as string | null,
                title_japanese: resolveValue(nodeData, entry.title_japanese) as string | null,
                image_url: resolveValue(nodeData, entry.image_url) as string,
                notes: resolveValue(nodeData, entry.notes) as string | null,
                created_at: resolveValue(nodeData, entry.created_at) as string,
                updated_at: resolveValue(nodeData, entry.updated_at) as string,
                releases: [],
                alternatives: [],
                unmuxed: [],
                comparisons: []
            };

            // Parse releases
            const releaseIndices = resolveValue(nodeData, entry.releases);
            if (Array.isArray(releaseIndices)) {
                for (const relIdx of releaseIndices) {
                    const relEntry = nodeData[relIdx as number] as Record<string, number>;
                    if (!relEntry) continue;

                    // Get download_links - it's an array of indices pointing to actual URLs
                    const downloadLinksIndices = resolveValue(nodeData, relEntry.download_links);
                    let downloadLinks: string[] | null = null;

                    if (Array.isArray(downloadLinksIndices)) {
                        downloadLinks = downloadLinksIndices
                            .map(linkIdx => resolveValue(nodeData, linkIdx as number))
                            .filter((link): link is string => typeof link === "string");
                    }

                    const release: AnimeRelease = {
                        id: resolveValue(nodeData, relEntry.id) as number,
                        name: resolveValue(nodeData, relEntry.name) as string,
                        anime_id: resolveValue(nodeData, relEntry.anime_id) as number,
                        created_at: resolveValue(nodeData, relEntry.created_at) as string,
                        description: resolveValue(nodeData, relEntry.description) as string | null,
                        download_links: downloadLinks
                    };
                    anime.releases.push(release);
                }
            }

            animeList.push(anime);
        }
    } catch (e) {
        logger.error(e, "Error parsing API data");
    }

    return animeList;
}

function resolveValue(nodeData: unknown[], index: number | undefined): unknown {
    if (index === undefined || index === null) return null;
    return nodeData[index];
}
