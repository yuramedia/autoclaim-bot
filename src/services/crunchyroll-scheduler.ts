/**
 * Crunchyroll Feed Scheduler
 * Polls for new episodes and sends Discord notifications
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { GuildSettings } from "../database/models/GuildSettings";
import { CrunchyrollService } from "./crunchyroll";
import { LANG_MAP, CRUNCHYROLL_COLOR, CRUNCHYROLL_POLL_INTERVAL } from "../constants";
import { AnimeMetadataService } from "./anime-metadata";
import type { FormattedEpisode } from "../types/crunchyroll";

// Cache of last seen episode IDs (in-memory)
const seenEpisodes = new Set<string>();
let isFirstRun = true;

export function startCrunchyrollFeed(client: Client): void {
    console.log("📺 Starting Crunchyroll feed scheduler...");

    const service = new CrunchyrollService();

    // Initial fetch to populate cache
    initializeCache(service);

    // Poll every 5 minute
    setInterval(async () => {
        // Only run on Shard 0 to prevent duplicates
        if (client.shard && client.shard.ids[0] !== 0) {
            return;
        }

        await checkForNewEpisodes(client, service);
    }, CRUNCHYROLL_POLL_INTERVAL);
}

async function initializeCache(service: CrunchyrollService): Promise<void> {
    try {
        console.log("📺 Initializing Crunchyroll episode cache...");
        const episodes = await service.fetchLatestEpisodes("en-US", 100);

        for (const ep of episodes) {
            seenEpisodes.add(ep.id);
        }

        console.log(`📺 Cached ${seenEpisodes.size} episodes`);
        isFirstRun = false;
    } catch (error) {
        console.error("Failed to initialize Crunchyroll cache:", error);
    }
}

async function checkForNewEpisodes(client: Client, service: CrunchyrollService): Promise<void> {
    try {
        const episodes = await service.fetchLatestEpisodes("en-US", 50);
        if (episodes.length === 0) return;

        // Fetch RSS publishers for enrichment
        await service.fetchRssPublishers();

        // Find new episodes
        const newEpisodes: FormattedEpisode[] = [];
        for (const ep of episodes) {
            if (!seenEpisodes.has(ep.id)) {
                seenEpisodes.add(ep.id);
                if (!isFirstRun) {
                    const formatted = service.formatEpisode(ep);
                    // Add publisher from RSS cache
                    formatted.publisher = service.getPublisher(ep.external_id);
                    newEpisodes.push(formatted);
                }
            }
        }

        if (newEpisodes.length === 0) return;

        // Enrich with series posters
        const enrichedEpisodes = await service.enrichWithSeriesPoster(newEpisodes);

        console.log(`📺 Found ${enrichedEpisodes.length} new Crunchyroll episode(s)`);

        // Enrich with Metadata (MAL/Anilist/AniDB)
        for (const ep of enrichedEpisodes) {
            try {
                const metadata = await AnimeMetadataService.searchAnime(ep.seriesTitle);
                if (metadata) {
                    ep.externalLinks = {
                        anilist: metadata.siteUrl || `https://anilist.co/anime/${metadata.id}`,
                        mal: metadata.idMal ? `https://myanimelist.net/anime/${metadata.idMal}` : undefined
                    };
                } else {
                    // Search fallback
                    ep.externalLinks = {
                        anilist: `https://anilist.co/search/anime?search=${encodeURIComponent(ep.seriesTitle)}`,
                        mal: `https://myanimelist.net/anime.php?q=${encodeURIComponent(ep.seriesTitle)}`
                    };
                }
            } catch (e) {
                console.error(`Error enriching metadata for ${ep.seriesTitle}:`, e);
            }
        }

        // Get all guilds with Crunchyroll feed enabled
        const guilds = await GuildSettings.find({
            "crunchyrollFeed.enabled": true,
            "crunchyrollFeed.channelId": { $ne: null }
        });

        if (guilds.length === 0) return;

        // Send notifications to each guild
        for (const guild of guilds) {
            try {
                const channel = await client.channels.fetch(guild.crunchyrollFeed.channelId!);
                if (!channel || !(channel instanceof TextChannel)) continue;

                // Send each new episode (limit to 10 per cycle to avoid spam)
                for (const episode of enrichedEpisodes.slice(0, 10)) {
                    const embed = buildEpisodeEmbed(episode);
                    await channel.send({ embeds: [embed] });

                    // Small delay between messages
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Failed to send to guild ${guild.guildId}:`, error);
            }
        }
    } catch (error) {
        console.error("Crunchyroll feed check error:", error);
    }
}

function buildEpisodeEmbed(episode: FormattedEpisode): EmbedBuilder {
    const authorName = episode.publisher ? `${episode.publisher}` : "Crunchyroll New Video";

    const embed = new EmbedBuilder()
        .setColor(CRUNCHYROLL_COLOR)
        .setAuthor({
            name: authorName,
            iconURL: "https://www.crunchyroll.com/favicons/favicon-32x32.png"
        })
        .setTitle(episode.title)
        .setURL(episode.url)
        .setDescription(episode.description.slice(0, 200) + (episode.description.length > 200 ? "..." : ""))
        .setTimestamp(episode.releasedAt);

    // Add thumbnail and image
    if (episode.seriesPoster) {
        embed.setThumbnail(episode.seriesPoster);
    }
    if (episode.thumbnail) {
        embed.setImage(episode.thumbnail);
    }

    // Episode info fields
    embed.addFields(
        {
            name: "Episode ID",
            value: episode.episodeId,
            inline: true
        },
        {
            name: "Season ID",
            value: episode.seasonId,
            inline: true
        },
        {
            name: "Series ID",
            value: episode.seriesId,
            inline: true
        },
        {
            name: "Version",
            value: LANG_MAP[episode.audioLocale] || episode.audioLocale,
            inline: true
        },
        {
            name: "IsDub",
            value: episode.isDub ? "true" : "false",
            inline: true
        },
        {
            name: "Duration",
            value: episode.duration,
            inline: true
        }
    );

    // Subtitles
    embed.addFields({
        name: "Subtitles",
        value: episode.subtitles,
        inline: false
    });

    // External Links (2 Columns)
    if (episode.externalLinks) {
        const { mal, anilist } = episode.externalLinks;

        // MAL
        if (mal) {
            // Extract ID from URL for display if possible, else "Link"
            const malId = mal.split("/").pop() || "Link";
            embed.addFields({ name: "MAL", value: `[${malId}](${mal})`, inline: true });
        } else {
            embed.addFields({ name: "MAL", value: "-", inline: true });
        }

        // Anilist
        if (anilist) {
            const anilistId = anilist.split("/").pop() || "Link";
            embed.addFields({ name: "Anilist", value: `[${anilistId}](${anilist})`, inline: true });
        } else {
            embed.addFields({ name: "Anilist", value: "-", inline: true });
        }
    }

    // Footer
    embed.setFooter({
        text: "Hidup CR!"
    });

    return embed;
}
