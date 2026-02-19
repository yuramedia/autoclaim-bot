/**
 * U2 Feed Service
 * Parses U2 (u2.dmhy.org) RSS feed for BDMV torrents
 */

import type { U2FeedItem, FormattedU2Item } from "../types/u2-feed";
import { U2_IMAGE_PATTERN, U2_ATTACH_IMAGE_PATTERN } from "../constants/u2-feed";

export class U2FeedService {
    /**
     * Fetch and parse RSS feed from U2
     */
    async fetchFeed(feedUrl: string): Promise<U2FeedItem[]> {
        try {
            const response = await fetch(feedUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (compatible; AutoClaimBot/1.0)"
                }
            });

            if (!response.ok) {
                console.error("U2 RSS fetch failed:", response.status);
                return [];
            }

            const xml = await response.text();
            return this.parseRss(xml);
        } catch (error) {
            console.error("U2 RSS fetch error:", error);
            return [];
        }
    }

    /**
     * Parse RSS XML into feed items
     */
    private parseRss(xml: string): U2FeedItem[] {
        const items: U2FeedItem[] = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/g;

        let match;
        while ((match = itemRegex.exec(xml)) !== null) {
            const itemXml = match[1];
            if (!itemXml) continue;

            try {
                const title = this.extractCdata(itemXml, "title") || "";
                const link = this.extractTag(itemXml, "link") || "";
                const description = this.extractCdata(itemXml, "description") || "";
                const author = this.extractCdata(itemXml, "author") || "";
                const category = this.extractTag(itemXml, "category") || "";
                const guid = this.extractTag(itemXml, "guid") || this.extractCdata(itemXml, "guid") || "";
                const pubDate = this.extractTag(itemXml, "pubDate") || "";

                // Parse enclosure
                const enclosureMatch = itemXml.match(/<enclosure\s+url="([^"]*)"(?:\s+length="(\d*)")?/);
                const downloadUrl = enclosureMatch?.[1]?.replace(/&amp;/g, "&") || "";
                const sizeBytes = enclosureMatch?.[2] ? parseInt(enclosureMatch[2], 10) : 0;

                items.push({
                    title,
                    link,
                    description,
                    author,
                    category,
                    guid,
                    downloadUrl,
                    sizeBytes,
                    pubDate
                });
            } catch (error) {
                console.error("Error parsing U2 RSS item:", error);
            }
        }

        return items;
    }

    /**
     * Extract CDATA content from an XML tag
     */
    private extractCdata(xml: string, tag: string): string | null {
        const regex = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, "i");
        const match = regex.exec(xml);
        return match?.[1]?.trim() || null;
    }

    /**
     * Extract plain text content from an XML tag
     */
    private extractTag(xml: string, tag: string): string | null {
        // Try CDATA first
        const cdata = this.extractCdata(xml, tag);
        if (cdata) return cdata;

        // Fall back to plain text
        const regex = new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, "i");
        const match = regex.exec(xml);
        return match?.[1]?.trim() || null;
    }

    /**
     * Extract first image URL from HTML description
     * Follows Rimuru-Bot's pattern for U2 attachment handling
     */
    extractImage(description: string): string | null {
        if (!description) return null;

        // Find all img src attributes and pick the first valid one
        const imgSrcRegex = /src=['"]([^'"]+\.(?:jpg|jpeg|png|gif|webp))/gi;
        let imgMatch;
        while ((imgMatch = imgSrcRegex.exec(description)) !== null) {
            let url = imgMatch[1];
            if (!url) continue;

            // Skip relative placeholders (e.g. pic/trans.gif)
            if (!url.startsWith("http") && !url.startsWith("//") && !U2_ATTACH_IMAGE_PATTERN.test(url)) {
                continue;
            }

            if (U2_ATTACH_IMAGE_PATTERN.test(url)) {
                url = `https://u2.dmhy.org/${url}`;
            } else if (url.startsWith("//")) {
                url = `https:${url}`;
            }
            return url;
        }

        // Fall back to general URL pattern
        const match = U2_IMAGE_PATTERN.exec(description);
        if (match) {
            let url = match[0];
            if (U2_ATTACH_IMAGE_PATTERN.test(url)) {
                url = `https://u2.dmhy.org/${url}`;
            } else if (url.startsWith("//")) {
                url = `https:${url}`;
            }
            return url;
        }

        return null;
    }

    /**
     * Extract uploader name from author field
     * Format: "username@u2.dmhy.org (username)" or with HTML tags
     */
    private extractUploader(author: string): string {
        // Remove HTML tags (e.g. <i>FFVIFan</i>)
        const cleaned = author.replace(/<[^>]+>/g, "");
        // Extract name from parentheses
        const parenMatch = cleaned.match(/\(([^)]+)\)/);
        if (parenMatch?.[1]) return parenMatch[1].trim();
        // Fall back to part before @
        const atMatch = cleaned.match(/^([^@]+)@/);
        if (atMatch?.[1]) return atMatch[1].trim();
        return cleaned.trim() || "Unknown";
    }

    /**
     * Format file size from bytes to human-readable string
     */
    private formatSize(bytes: number): string {
        if (bytes <= 0) return "Unknown";
        const units = ["B", "KiB", "MiB", "GiB", "TiB"];
        let size = bytes;
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
        }
        return `${size.toFixed(2)} ${units[unitIndex]}`;
    }

    /**
     * Clean title by removing HTML tags
     */
    private cleanTitle(title: string): string {
        return title.replace(/<[^>]+>/g, "").trim();
    }

    /**
     * Format a raw feed item for Discord embed
     */
    formatItem(item: U2FeedItem): FormattedU2Item {
        return {
            title: this.cleanTitle(item.title),
            link: item.link,
            image: this.extractImage(item.description),
            category: item.category,
            uploader: this.extractUploader(item.author),
            size: this.formatSize(item.sizeBytes),
            pubDate: new Date(item.pubDate),
            guid: item.guid
        };
    }
}
