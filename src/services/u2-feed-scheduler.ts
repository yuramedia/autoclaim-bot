/**
 * U2 Feed Scheduler
 * Polls U2 RSS feed for new BDMV torrents and sends Discord notifications
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { GuildSettings } from "../database/models/GuildSettings";
import { U2FeedService } from "./u2-feed";
import { U2_POLL_INTERVAL, U2_COLOR, U2_ICON, U2_DEFAULT_FILTER } from "../constants/u2-feed";
import type { FormattedU2Item } from "../types/u2-feed";

/** Maximum number of seen items to cache */
const MAX_SEEN_ITEMS = 500;
/** Map of guid -> title for tracking edits */
const seenItems = new Map<string, string>();
let isFirstRun = true;

/** Prune oldest entries when the map exceeds limit */
function pruneSeenItems(): void {
    if (seenItems.size <= MAX_SEEN_ITEMS) return;
    const excess = seenItems.size - MAX_SEEN_ITEMS;
    let removed = 0;
    for (const key of seenItems.keys()) {
        if (removed >= excess) break;
        seenItems.delete(key);
        removed++;
    }
}

/**
 * Start the U2 feed scheduler
 */
export function startU2Feed(client: Client): void {
    const feedUrl = process.env.U2_RSS_URL;
    if (!feedUrl) {
        console.log("📦 U2 feed disabled (no U2_RSS_URL configured)");
        return;
    }

    console.log("📦 Starting U2 BDMV feed scheduler...");

    const service = new U2FeedService();

    // Initial fetch to populate cache
    initializeCache(service, feedUrl);

    // Poll at configured interval
    setInterval(async () => {
        // Only run on Shard 0 to prevent duplicates
        if (client.shard && client.shard.ids[0] !== 0) {
            return;
        }

        await checkForNewItems(client, service, feedUrl);
    }, U2_POLL_INTERVAL);
}

/**
 * Initialize cache with current feed items (don't post them)
 */
async function initializeCache(service: U2FeedService, feedUrl: string): Promise<void> {
    try {
        console.log("📦 Initializing U2 feed cache...");
        const items = await service.fetchFeed(feedUrl);

        for (const item of items) {
            seenItems.set(item.guid, item.title);
        }
        pruneSeenItems();

        console.log(`📦 Cached ${seenItems.size} U2 items`);
        isFirstRun = false;
    } catch (error) {
        console.error("Failed to initialize U2 feed cache:", error);
    }
}

/**
 * Check for new items and post to subscribed channels
 */
async function checkForNewItems(client: Client, service: U2FeedService, feedUrl: string): Promise<void> {
    try {
        const items = await service.fetchFeed(feedUrl);
        if (items.length === 0) return;

        // Find new or edited items
        const newItems: { item: FormattedU2Item; isEdited: boolean }[] = [];
        for (const item of items) {
            const prevTitle = seenItems.get(item.guid);

            if (prevTitle === undefined) {
                // New item
                seenItems.set(item.guid, item.title);
                if (!isFirstRun) {
                    newItems.push({ item: service.formatItem(item), isEdited: false });
                }
            } else if (prevTitle !== item.title) {
                // Edited item (title changed)
                seenItems.set(item.guid, item.title);
                if (!isFirstRun) {
                    console.log(`📦 Detected edit on ${item.guid}`);
                    newItems.push({ item: service.formatItem(item), isEdited: true });
                }
            }
        }
        pruneSeenItems();

        if (newItems.length === 0) return;

        console.log(`📦 Found ${newItems.length} new/edited U2 item(s)`);

        // Get all guilds with U2 feed enabled
        const guilds = await GuildSettings.find({
            "u2Feed.enabled": true,
            "u2Feed.channelId": { $ne: null }
        });

        if (guilds.length === 0) return;

        // Send notifications to each guild
        for (const guild of guilds) {
            try {
                const channel = await client.channels.fetch(guild.u2Feed.channelId!);
                if (!channel || !(channel instanceof TextChannel)) continue;

                // Get guild-specific filter (or default)
                const filterRegex = new RegExp(guild.u2Feed.filter || U2_DEFAULT_FILTER, "i");

                // Filter and post matching items (limit to 10 per cycle)
                const matchingItems = newItems.filter(entry => filterRegex.test(entry.item.title));

                for (const entry of matchingItems.slice(0, 10)) {
                    const embed = buildItemEmbed(entry.item, entry.isEdited);
                    await channel.send({ embeds: [embed] });

                    // Small delay between messages
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Failed to send U2 feed to guild ${guild.guildId}:`, error);
            }
        }
    } catch (error) {
        console.error("U2 feed check error:", error);
    }
}

/**
 * Build Discord embed for a U2 feed item
 */
function buildItemEmbed(item: FormattedU2Item, isEdited: boolean): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(U2_COLOR)
        .setAuthor({
            name: item.uploader,
            url: "https://u2.dmhy.org",
            iconURL: U2_ICON
        })
        .setTitle(item.title.length > 256 ? item.title.substring(0, 250) + "..." : item.title)
        .setURL(item.link)
        .setTimestamp(item.pubDate);

    // Add image if found
    if (item.image) {
        embed.setImage(item.image);
    }

    // Add fields
    embed.addFields(
        {
            name: "Category",
            value: item.category || "-",
            inline: true
        },
        {
            name: "Size",
            value: item.size,
            inline: true
        }
    );

    embed.setFooter({
        text: isEdited ? "📝 Edited · U2 BDMV" : "U2 BDMV"
    });

    return embed;
}
