/**
 * U2 Feed Scheduler
 * Polls U2 RSS feed for new BDMV torrents and sends Discord notifications
 * Based on Rimuru-Bot's Feed.check() + Feed.postNew() pattern
 */

import { Client, TextChannel, EmbedBuilder } from "discord.js";
import { GuildSettings } from "../database/models/GuildSettings";
import { U2FeedService } from "./u2-feed";
import {
    U2_POLL_INTERVAL,
    U2_COLOR,
    U2_ICON,
    U2_DEFAULT_FILTER,
    U2_MAX_ITEMS,
    U2_FIRST_RUN_MAX_AGE
} from "../constants/u2-feed";
import type { FormattedU2Item } from "../types/u2-feed";

/**
 * Cached items with wasPosted tracking
 * Matches Rimuru-Bot's Feed.items: MutableList<FeedItem>
 */
let cachedItems: FormattedU2Item[] = [];
let isFirstCheck = true;

/**
 * Check if two items are equal (for U2, match on link OR title)
 * Matches Rimuru-Bot's FeedItem.equals() for U2
 */
function itemEquals(a: FormattedU2Item, b: FormattedU2Item): boolean {
    const sameLink = a.link.trim().toLowerCase() === b.link.trim().toLowerCase();
    const sameTitle = a.title.trim().toLowerCase() === b.title.trim().toLowerCase();
    return sameLink || sameTitle;
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

    // First check after a small delay
    setTimeout(async () => {
        await checkFeed(client, service, feedUrl);
    }, 5000);

    // Poll at configured interval
    setInterval(async () => {
        // Only run on Shard 0 or un-sharded clients
        if (client.shard && client.shard.ids[0] !== 0) return;
        await checkFeed(client, service, feedUrl);
    }, U2_POLL_INTERVAL);
}

/**
 * Check feed for new items — matches Rimuru-Bot's Feed.check()
 * 1. Fetch RSS and parse items
 * 2. Add new items (matched via equals) to cache
 * 3. Sort by pubDate descending, cap at U2_MAX_ITEMS
 * 4. Post unposted items
 */
async function checkFeed(client: Client, service: U2FeedService, feedUrl: string): Promise<void> {
    try {
        const rawItems = await service.fetchFeed(feedUrl);
        if (!rawItems || rawItems.length === 0) {
            if (isFirstCheck) {
                console.log("📦 U2 feed empty on first check. Feed may be down.");
                isFirstCheck = false;
            }
            return;
        }

        // Apply regex filter per-item and add to cache if not existing
        for (const raw of rawItems) {
            try {
                const formatted = service.formatItem(raw);
                const existing = cachedItems.find(cached => itemEquals(cached, formatted));
                if (existing) continue;

                // New item — add to cache
                cachedItems.push(formatted);
            } catch (error) {
                console.error("U2 RSS item format error:", error);
            }
        }

        // Sort by pubDate descending, cap at U2_MAX_ITEMS
        cachedItems.sort((a, b) => b.pubDateUnix - a.pubDateUnix);
        if (cachedItems.length > U2_MAX_ITEMS) {
            cachedItems = cachedItems.slice(0, U2_MAX_ITEMS);
        }

        // Post new items
        await postNewItems(client, service);

        // On first check, mark all items as posted (silent cache population)
        if (isFirstCheck) {
            for (const item of cachedItems) {
                item.wasPosted = true;
            }
            console.log(`📦 Cached ${cachedItems.length} U2 items (first run, silent)`);
            isFirstCheck = false;
        }
    } catch (error) {
        console.error("U2 feed check error:", error);
        if (isFirstCheck) isFirstCheck = false;
    }
}

/**
 * Post unposted items to subscribed channels
 * Matches Rimuru-Bot's Feed.postNew()
 */
async function postNewItems(client: Client, _service: U2FeedService): Promise<void> {
    // Get all guilds with U2 feed enabled
    const guilds = await GuildSettings.find({
        "u2Feed.enabled": true,
        "u2Feed.channelId": { $ne: null }
    });

    if (guilds.length === 0) return;

    const now = Date.now();

    for (const item of cachedItems) {
        if (item.wasPosted) continue;

        // On first check, skip items older than 24 hours
        // Matches Rimuru-Bot's Instant check: isBefore(Instant.now().minus(24, ChronoUnit.HOURS))
        if (isFirstCheck && item.pubDateUnix > 0) {
            const itemAge = now - item.pubDateUnix * 1000;
            if (itemAge > U2_FIRST_RUN_MAX_AGE) continue;
        }

        // Post to each guild's configured channel
        for (const guild of guilds) {
            try {
                const channel = await client.channels.fetch(guild.u2Feed.channelId!);
                if (!channel || !(channel instanceof TextChannel)) continue;

                // Apply guild's filter regex
                const filterRegex = new RegExp(guild.u2Feed.filter || U2_DEFAULT_FILTER, "i");
                if (!filterRegex.test(item.title)) continue;

                const embed = buildItemEmbed(item);
                const message = await channel.send({ embeds: [embed] });

                // Cross-post if the channel is an announcement channel
                try {
                    await message.crosspost();
                } catch {
                    // Not an announcement channel or no permissions — ignore
                }
            } catch (error) {
                console.error(`Failed to send U2 feed to guild ${guild.guildId}:`, error);
            }
        }

        item.wasPosted = true;
    }
}

/**
 * Build Discord embed for a U2 feed item
 * Matches Rimuru-Bot's embed building in Feed.postNew()
 */
function buildItemEmbed(item: FormattedU2Item): EmbedBuilder {
    const embed = new EmbedBuilder()
        .setColor(U2_COLOR)
        .setAuthor({
            name: "U2",
            url: "https://u2.dmhy.org",
            iconURL: U2_ICON
        })
        .setTitle(item.title.length > 256 ? item.title.substring(0, 250) + "..." : item.title)
        .setURL(item.link || "https://u2.dmhy.org")
        .setTimestamp(item.pubDateUnix > 0 ? new Date(item.pubDateUnix * 1000) : item.pubDate);

    if (item.image) {
        embed.setImage(item.image);
    }

    embed.addFields(
        {
            name: "Category",
            value: item.category || "-",
            inline: true
        },
        {
            name: "Size",
            value: item.size || "Unknown",
            inline: true
        },
        {
            name: "Uploader",
            value: item.uploader || "Unknown",
            inline: true
        }
    );

    embed.setFooter({ text: "U2 BDMV" });

    return embed;
}
