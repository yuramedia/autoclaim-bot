/**
 * YouTube Feed Service
 * Handles resolving YouTube handles/URLs to Channel IDs and parsing YouTube Atom RSS XML feeds.
 */

import he from "he";
const { decode } = he;
import { YT_FEED_BASE_URL } from "../constants/youtube-feed";
import { logger } from "../core/logger";
import type { YouTubeFeedEntry, FormattedYouTubeVideo } from "../types/youtube-feed";

export class YouTubeFeedService {
    /**
     * Resolves a YouTube input (channel URL, @handle, or channel ID) to channel metadata.
     * @param input Raw input string from user (e.g., "https://www.youtube.com/@AniOneID", "@AniOneID", "UC...")
     * @returns Channel details or null if resolution fails
     */
    async resolveChannelId(input: string): Promise<{ channelId: string; channelName: string; handle: string } | null> {
        try {
            const cleanInput = input.trim();
            let handle = "";
            let targetUrl = "";

            // Check if input is direct channel ID starting with UC (24 characters)
            if (/^UC[a-zA-Z0-9_-]{22}$/.test(cleanInput)) {
                const channelId = cleanInput;
                const feed = await this.fetchFeed(channelId);
                const channelName = feed[0]?.channelName ?? `Channel ${channelId}`;
                return {
                    channelId,
                    channelName,
                    handle: `@${channelId}`
                };
            }

            // Extract handle or path
            if (cleanInput.startsWith("http://") || cleanInput.startsWith("https://")) {
                targetUrl = cleanInput;
                const urlObj = new URL(cleanInput);
                const pathname = urlObj.pathname;

                if (pathname.startsWith("/@")) {
                    handle = pathname.substring(1); // e.g. "@AniOneID"
                } else if (pathname.startsWith("/channel/")) {
                    const candidateId = pathname.split("/")[2];
                    if (candidateId && /^UC[a-zA-Z0-9_-]{22}$/.test(candidateId)) {
                        const feed = await this.fetchFeed(candidateId);
                        const channelName = feed[0]?.channelName ?? `Channel ${candidateId}`;
                        return {
                            channelId: candidateId,
                            channelName,
                            handle: `@${candidateId}`
                        };
                    }
                }
            } else if (cleanInput.startsWith("@")) {
                handle = cleanInput;
                targetUrl = `https://www.youtube.com/${handle}`;
            } else {
                handle = `@${cleanInput}`;
                targetUrl = `https://www.youtube.com/${handle}`;
            }

            // Fetch YouTube page HTML to extract channelId and channel name
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            let html = "";
            try {
                const response = await fetch(targetUrl, {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept-Language": "en-US,en;q=0.9"
                    },
                    signal: controller.signal
                });

                if (!response.ok) {
                    logger.error(`Failed to fetch YouTube page for ${targetUrl}: HTTP ${response.status}`);
                    return null;
                }

                html = await response.text();
            } finally {
                clearTimeout(timeoutId);
            }

            // Match channel ID patterns in YouTube HTML
            // 1. <meta itemprop="identifier" content="UC..."> or <meta itemprop="channelId" content="UC...">
            // 2. "channelId":"UC..." or "externalId":"UC..."
            // 3. canonical link tag href="https://www.youtube.com/channel/UC..."
            let channelId: string | null = null;

            const metaIdMatch =
                html.match(
                    /meta\s+itemprop=["'](?:channelId|identifier)["']\s+content=["'](UC[a-zA-Z0-9_-]{22})["']/i
                ) ||
                html.match(/meta\s+content=["'](UC[a-zA-Z0-9_-]{22})["']\s+itemprop=["'](?:channelId|identifier)["']/i);

            if (metaIdMatch?.[1]) {
                channelId = metaIdMatch[1];
            }

            if (!channelId) {
                const jsonIdMatch = html.match(/["'](?:channelId|externalId)["']\s*:\s*["'](UC[a-zA-Z0-9_-]{22})["']/);
                if (jsonIdMatch?.[1]) {
                    channelId = jsonIdMatch[1];
                }
            }

            if (!channelId) {
                const canonicalMatch = html.match(
                    /link\s+rel=["']canonical["']\s+href=["']https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]{22})["']/i
                );
                if (canonicalMatch?.[1]) {
                    channelId = canonicalMatch[1];
                }
            }

            if (!channelId) {
                logger.error(`Could not extract channelId from HTML for input: ${input}`);
                return null;
            }

            // Extract channel title
            let channelName = handle || "YouTube Channel";
            const titleMatch =
                html.match(/meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                html.match(/<title>([^<]+)<\/title>/i);
            if (titleMatch?.[1]) {
                let nameStr = decode(titleMatch[1].trim());
                nameStr = nameStr.replace(/\s*-\s*YouTube$/i, "").trim();
                if (nameStr) channelName = nameStr;
            }

            return {
                channelId,
                channelName,
                handle: handle || `@${channelId}`
            };
        } catch (error) {
            logger.error(error, `Error resolving YouTube channel ID for input "${input}"`);
            return null;
        }
    }

    /**
     * Fetch and parse Atom XML feed for a YouTube channel.
     * @param channelId The 24-char channel ID starting with UC
     * @returns Array of YouTube feed entries
     */
    async fetchFeed(channelId: string): Promise<YouTubeFeedEntry[]> {
        try {
            const feedUrl = `${YT_FEED_BASE_URL}${channelId}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            let xml = "";
            try {
                const response = await fetch(feedUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (compatible; AutoClaimBot/1.0)"
                    },
                    signal: controller.signal
                });

                if (!response.ok) {
                    logger.error(`YouTube Atom fetch failed for ${channelId}: status ${response.status}`);
                    return [];
                }

                xml = await response.text();
            } finally {
                clearTimeout(timeoutId);
            }
            return this.parseAtomFeed(xml);
        } catch (error) {
            logger.error(error, `YouTube Atom fetch error for channel ${channelId}`);
            return [];
        }
    }

    /**
     * Parse YouTube Atom XML into array of YouTubeFeedEntry objects using fast-xml-parser.
     * @param xml Raw Atom XML text
     */
    private parseAtomFeed(xml: string): YouTubeFeedEntry[] {
        const entries: YouTubeFeedEntry[] = [];
        try {
            const { XMLParser } = require("fast-xml-parser");
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: "@_",
                isArray: (name: string) => name === "entry" || name === "link" || name === "media:thumbnail"
            });

            const result = parser.parse(xml);
            const rawEntries = result?.feed?.entry || [];

            for (const entry of rawEntries) {
                try {
                    const videoId = String(entry["yt:videoId"] || entry.id || "").replace(/^yt:video:/, "");
                    const title =
                        typeof entry.title === "object"
                            ? String(entry.title?.["#text"] || "")
                            : String(entry.title || "");
                    const channelId = String(entry["yt:channelId"] || "");
                    const channelName =
                        typeof entry.author?.name === "object"
                            ? String(entry.author?.name?.["#text"] || "")
                            : String(entry.author?.name || "");
                    const published = String(entry.published || "");
                    const updated = String(entry.updated || "");

                    const mediaGroup = entry["media:group"];
                    let thumbnail: string | null = null;

                    if (Array.isArray(mediaGroup?.["media:thumbnail"]) && mediaGroup["media:thumbnail"].length > 0) {
                        thumbnail = mediaGroup["media:thumbnail"][0]?.["@_url"] || null;
                    } else if (mediaGroup?.["media:thumbnail"]?.["@_url"]) {
                        thumbnail = mediaGroup["media:thumbnail"]["@_url"];
                    }

                    if (!thumbnail && videoId) {
                        thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                    }

                    const description =
                        typeof mediaGroup?.["media:description"] === "object"
                            ? String(mediaGroup["media:description"]?.["#text"] || "")
                            : String(mediaGroup?.["media:description"] || "");

                    let link = "";
                    if (Array.isArray(entry.link)) {
                        const altLink = entry.link.find(
                            (l: Record<string, string>) => l["@_rel"] === "alternate" || !l["@_rel"]
                        );
                        link = altLink?.["@_href"] || "";
                    }

                    if (!link && videoId) {
                        link = `https://www.youtube.com/watch?v=${videoId}`;
                    }

                    if (videoId && title) {
                        entries.push({
                            videoId,
                            title,
                            channelId,
                            channelName,
                            published,
                            updated,
                            thumbnail,
                            description,
                            link
                        });
                    }
                } catch (entryError) {
                    logger.error(entryError, "Error parsing individual YouTube feed entry");
                }
            }
        } catch (error) {
            logger.error(error, "Error parsing YouTube Atom XML");
        }
        return entries;
    }

    /**
     * Formats a raw YouTube feed entry for Discord embed consumption.
     * @param entry Raw entry
     */
    formatEntry(entry: YouTubeFeedEntry): FormattedYouTubeVideo {
        const rawTitle = entry.title || "Untitled Video";
        let title = decode(rawTitle.replace(/<[^>]+>/g, "").trim());
        if (title.length > 256) title = title.substring(0, 250) + "...";

        const videoUrl = entry.link || `https://www.youtube.com/watch?v=${entry.videoId}`;
        const channelUrl = entry.channelId
            ? `https://www.youtube.com/channel/${entry.channelId}`
            : "https://www.youtube.com";
        const publishedDate = entry.published ? new Date(entry.published) : new Date();
        const publishedUnix = Math.floor(publishedDate.getTime() / 1000);

        let description = entry.description ? decode(entry.description.trim()) : "";
        if (description.length > 300) {
            description = description.substring(0, 297) + "...";
        }

        return {
            videoId: entry.videoId,
            title,
            videoUrl,
            thumbnail: entry.thumbnail,
            channelName: entry.channelName || "YouTube",
            channelUrl,
            publishedAt: publishedDate,
            publishedUnix,
            description,
            wasPosted: false
        };
    }
}
