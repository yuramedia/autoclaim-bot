/**
 * Crunchyroll Feed Scheduler
 * Polls for new episodes and sends Discord notifications
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { GuildSettings } from "../database/models/GuildSettings";
import { CrunchyrollService } from "./crunchyroll";
import { LANG_MAP } from "../constants";
import type { FormattedEpisode } from "../types/crunchyroll";

// Cache of last seen episode IDs (in-memory)
const seenEpisodes = new Set<string>();
let isFirstRun = true;

// Crunchyroll orange color
const CRUNCHYROLL_COLOR = 0xf47521;

export function startCrunchyrollFeed(client: Client): void {
    console.log("📺 Starting Crunchyroll feed scheduler...");

    const service = new CrunchyrollService();

    // Initial fetch to populate cache
    initializeCache(service);

    // Poll every 1 minute
    setInterval(
        async () => {
            // Only run on Shard 0 to prevent duplicates
            if (client.shard && client.shard.ids[0] !== 0) {
                return;
            }

            await checkForNewEpisodes(client, service);
        },
        1 * 60 * 1000
    ); // 1 minute
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

        // Find new episodes
        const newEpisodes: FormattedEpisode[] = [];
        for (const ep of episodes) {
            if (!seenEpisodes.has(ep.id)) {
                seenEpisodes.add(ep.id);
                if (!isFirstRun) {
                    newEpisodes.push(service.formatEpisode(ep));
                }
            }
        }

        if (newEpisodes.length === 0) return;

        console.log(`📺 Found ${newEpisodes.length} new Crunchyroll episode(s)`);

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

                // Send each new episode (limit to 5 per cycle to avoid spam)
                for (const episode of newEpisodes.slice(0, 5)) {
                    const embed = buildEpisodeEmbed(episode);
                    await channel.send({ embeds: [embed] });

                    // Small delay between messages
                    await new Promise(resolve => setTimeout(resolve, 500));
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
    const embed = new EmbedBuilder()
        .setColor(CRUNCHYROLL_COLOR)
        .setAuthor({
            name: "Crunchyroll New Video",
            iconURL: "https://www.crunchyroll.com/favicons/favicon-32x32.png"
        })
        .setTitle(episode.title)
        .setURL(episode.url)
        .setDescription(episode.description.slice(0, 200) + (episode.description.length > 200 ? "..." : ""))
        .setTimestamp(episode.releasedAt);

    // Add thumbnail
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

    // Footer
    embed.setFooter({
        text: "Hidup CR!"
    });

    return embed;
}
