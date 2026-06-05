/**
 * U2 Feed Service
 * Parses U2 (u2.dmhy.org) RSS feed for BDMV torrents
 * Uses native fetch + regex XML parsing (no rss-parser dependency)
 * Based on Rimuru-Bot's Feed.kt / FeedItem.kt patterns
 */

import { decode } from "he";
import type { U2FeedItem, FormattedU2Item } from "../types/u2-feed";
import { U2_IMAGE_PATTERN, U2_ATTACH_IMAGE_PATTERN } from "../constants/u2-feed";

/**
 * Light-escape special characters in URLs before fetching
 * Matches Rimuru-Bot's lightEscapeURL() extension
 * @param url - The URL to light escape
 * @returns The escaped URL string
 */
function lightEscapeURL(url: string): string {
    return url
        .replace(/"/g, "%22")
        .replace(/ /g, "%20")
        .replace(/\[/g, "%5B")
        .replace(/\]/g, "%5D")
        .replace(/\|/g, "%7C");
}

/**
 * Extract content from a CDATA section or plain text XML tag
 * @param raw - Raw XML content
 * @returns Plaint text within CDATA or stripped content
 */
function extractCDATA(raw: string): string {
    const cdataMatch = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
    if (cdataMatch) return cdataMatch[1]!;
    // Strip any remaining XML tags
    return raw.replace(/<[^>]+>/g, "").trim();
}

/**
 * Extract a single XML tag value from a block of XML
 * @param xml - The XML content
 * @param tag - Tag name to extract
 * @returns Tag text value
 */
function extractTag(xml: string, tag: string): string {
    const regex = new RegExp(`<${tag}[&>]*>([\\s\\S]*?)</${tag}>`, "i");
    const match = xml.match(regex);
    return match ? extractCDATA(match[1]!) : "";
}

/**
 * Format bytes to human-readable size
 * @param bytes - Size in bytes
 * @returns Formatted size string
 */
function formatBytes(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KiB`;
    return `${bytes} B`;
}

/**
 * Service to fetch, parse, and format the U2 RSS feed.
 */
export class U2FeedService {
    /**
     * Fetch and parse RSS feed from U2.
     * @param feedUrl - The U2 RSS feed URL.
     * @returns A promise resolving to an array of U2 feed items.
     */
    async fetchFeed(feedUrl: string): Promise<U2FeedItem[]> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(lightEscapeURL(feedUrl), {
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; AutoClaimBot/1.0)"
                },
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                console.error("U2 RSS fetch failed:", response.status);
                return [];
            }

            const xml = await response.text();
            return this.parseItems(xml);
        } catch (error) {
            console.error("U2 RSS fetch error:", error);
            return [];
        }
    }

    /**
     * Parse RSS XML into U2FeedItem array.
     * @param xml - Raw RSS XML string.
     * @returns Array of parsed U2FeedItems.
     */
    private parseItems(xml: string): U2FeedItem[] {
        const items: U2FeedItem[] = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let match;

        while ((match = itemRegex.exec(xml)) !== null) {
            try {
                const block = match[1]!;
                const title = extractTag(block, "title");
                const link = extractTag(block, "link");
                const description = extractTag(block, "description");
                const author = extractTag(block, "author");
                const guid = extractTag(block, "guid");
                const pubDate = extractTag(block, "pubDate");

                // Category: extract text content from <category> tag
                const categoryMatch = block.match(/<category[^>]*>([\s\S]*?)<\/category>/i);
                const category = categoryMatch ? extractCDATA(categoryMatch[1]!) : "";

                // Enclosure: extract size from length attribute
                const enclosureMatch = block.match(/<enclosure[^>]*length="(\d+)"[^>]*\/?>/i);
                const sizeBytes = enclosureMatch ? parseInt(enclosureMatch[1]!, 10) : null;

                items.push({
                    title,
                    author,
                    category,
                    description,
                    guid,
                    link,
                    pubDate,
                    sizeBytes
                });
            } catch (error) {
                console.error("U2 RSS item parse error:", error);
            }
        }

        return items;
    }

    /**
     * Extract first image URL from HTML description.
     * Matches Rimuru-Bot's FeedItem.getImage().
     * @param description - HTML description content.
     * @returns The extracted image URL, or null if not found.
     */
    extractImage(description?: string): string | null {
        if (!description || description.trim() === "") return null;

        // Primary: extract src attribute from <img> tag (handles CDATA HTML content)
        // Use \b and non-greedy [^>]*? to reliably find src in any attribute order
        const imgSrcMatch = description.match(/<img\b[^>]*?\bsrc=["']?([^"'\s>]+)["']?/i);
        if (imgSrcMatch?.[1]) {
            let url = decode(imgSrcMatch[1].trim());

            if (U2_ATTACH_IMAGE_PATTERN.test(url)) {
                url = `https://u2.dmhy.org/${url}`;
            } else if (url.startsWith("//")) {
                url = `https:${url}`;
            }

            return url;
        }

        // Fallback: match raw image URL ending in known extension
        const match = U2_IMAGE_PATTERN.exec(description);
        if (!match) return null;

        let url = match[0]!;

        // Handle U2 attachment paths
        if (U2_ATTACH_IMAGE_PATTERN.test(url)) {
            url = `https://u2.dmhy.org/${url}`;
        } else if (url.startsWith("//")) {
            url = `https:${url}`;
        }

        return url;
    }

    /**
     * Extract uploader name from author field.
     * Format: "username@u2.dmhy.org (username)"
     * @param author - Author field content.
     * @returns The extracted uploader name.
     */
    private extractUploader(author?: string): string {
        if (!author) return "Unknown";

        const cleaned = author.replace(/<[^>]+>/g, "").trim();
        const parenMatch = cleaned.match(/\(([^)]+)\)/);
        if (parenMatch?.[1]) return parenMatch[1].trim();

        const atMatch = cleaned.match(/^([^@]+)@/);
        if (atMatch?.[1]) return atMatch[1].trim();

        return cleaned || "Unknown";
    }

    /**
     * Get human-readable size from enclosure bytes or title fallback.
     * @param sizeBytes - Torrent size in bytes.
     * @param title - Title content for fallback.
     * @returns Human-readable size string.
     */
    private getSize(sizeBytes: number | null, title?: string): string {
        if (sizeBytes && sizeBytes > 0) {
            return formatBytes(sizeBytes);
        }
        // Fallback: extract from title brackets like [42.5 GiB]
        if (title) {
            const sizeMatch = title.match(/\[(\d+(?:\.\d+)?\s*[KMG]i?B)\]/i);
            if (sizeMatch?.[1]) return sizeMatch[1];
        }
        return "Unknown";
    }

    /**
     * Parse pubDate string (RFC 2822) to unix timestamp.
     * Matches Rimuru-Bot's getUnixPubTime().
     * @param pubDate - RFC 2822 format date string.
     * @returns Unix timestamp.
     */
    getUnixPubTime(pubDate: string): number {
        if (!pubDate || pubDate.trim() === "") return 0;
        try {
            return Math.floor(new Date(pubDate).getTime() / 1000);
        } catch {
            return 0;
        }
    }

    /**
     * Format a raw feed item for Discord embed.
     * Matches Rimuru-Bot's FeedItem data class.
     * @param item - The raw U2 feed item.
     * @returns The formatted feed item.
     */
    formatItem(item: U2FeedItem): FormattedU2Item {
        const rawTitle = item.title || "Unknown Title";
        // HTML unescape (matches Rimuru-Bot's HtmlEscape.unescapeHtml)
        let title = decode(rawTitle.replace(/<[^>]+>/g, "").trim());
        // Truncate to Discord's 256 char embed title limit
        if (title.length > 256) title = title.substring(0, 250) + "...";

        const pubDateUnix = this.getUnixPubTime(item.pubDate);

        // Decode HTML entities in link URL (RSS XML encodes '&' as '&amp;')
        const link = item.link ? decode(item.link.trim()) : "";

        return {
            title,
            link,
            image: this.extractImage(item.description) || null,
            category: item.category || "BDMV",
            uploader: this.extractUploader(item.author),
            size: this.getSize(item.sizeBytes, item.title),
            pubDate: item.pubDate ? new Date(item.pubDate) : new Date(),
            pubDateUnix,
            guid: item.guid || item.link || rawTitle,
            wasPosted: false
        };
    }
}
