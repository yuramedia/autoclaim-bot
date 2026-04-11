/**
 * U2 Feed Scheduler
 * Polls U2 RSS feed for new BDMV torrents and sends Discord notifications
 * Based on Rimuru-Bot's Feed.check() + Feed.postNew() pattern
 */

import { Client } from "discord.js";
import { GuildSettings } from "../database/models/GuildSettings";
import { U2FeedService } from "./u2-feed";
import { ramen } from "../core/ramen";
import { U2_POLL_INTERVAL, U2_DEFAULT_FILTER, U2_MAX_ITEMS } from "../constants/u2-feed";
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
    const maskedUrl = feedUrl.replace(/passkey=[^&\s]*/i, "passkey=***");
    console.log(`📦 Feed URL: ${maskedUrl}`);
    const service = new U2FeedService();

    // First check after a small delay (shard-guarded)
    setTimeout(async () => {
        if (client.shard && client.shard.ids[0] !== 0) return;
        await checkFeed(service, feedUrl);
    }, 5000);

    // Poll at configured interval
    setInterval(async () => {
        // Only run on Shard 0 or un-sharded clients
        if (client.shard && client.shard.ids[0] !== 0) return;
        await checkFeed(service, feedUrl);
    }, U2_POLL_INTERVAL);
}

/**
 * Check feed for new items — matches Rimuru-Bot's Feed.check()
 * 1. Fetch RSS and parse items
 * 2. Add new items (matched via equals) to cache
 * 3. Sort by pubDate descending, cap at U2_MAX_ITEMS
 * 4. On first check: silently populate cache (no Discord posts)
 * 5. On subsequent checks: post unposted items
 */
async function checkFeed(service: U2FeedService, feedUrl: string): Promise<void> {
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

        // On first check, silently populate cache — do NOT post anything
        if (isFirstCheck) {
            for (const item of cachedItems) {
                item.wasPosted = true;
            }
            console.log(`📦 Cached ${cachedItems.length} U2 items (first run, silent)`);
            isFirstCheck = false;
            return;
        }

        // Post new items on subsequent checks
        await postNewItems();
    } catch (error) {
        console.error("U2 feed check error:", error);
        if (isFirstCheck) isFirstCheck = false;
    }
}

/**
 * Post unposted items to subscribed channels
 * Matches Rimuru-Bot's Feed.postNew()
 */
async function postNewItems(): Promise<void> {
    // Get all guilds with U2 feed enabled
    const guilds = await GuildSettings.find({
        "u2Feed.enabled": true,
        "u2Feed.channelId": { $ne: null }
    });

    if (guilds.length === 0) return;

    const targets = guilds.map(g => ({
        channelId: g.u2Feed.channelId!,
        filter: g.u2Feed.filter || U2_DEFAULT_FILTER
    }));

    const newItems = cachedItems.filter(item => !item.wasPosted);

    if (newItems.length > 0) {
        ramen.publish("u2:new_torrents", {
            items: newItems,
            targets
        });

        for (const item of newItems) {
            item.wasPosted = true;
        }
    }
}
