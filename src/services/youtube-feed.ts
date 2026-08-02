/**
 * YouTube Feed Service
 * Handles resolving YouTube handles/URLs to Channel IDs and parsing YouTube Atom RSS XML feeds.
 */

import he from "he";
const { decode } = he;
import { YT_FEED_BASE_URL } from "../constants/youtube-feed";
import { logger } from "../core/logger";
import type { YouTubeFeedEntry, FormattedYouTubeVideo, YouTubeVideoStatusType } from "../types/youtube-feed";

export class YouTubeFeedService {
    private channelIconCache: Map<string, string> = new Map();

    /**
     * Resolves a YouTube input (channel URL, @handle, or channel ID) to channel metadata.
     * @param input Raw input string from user (e.g., "https://www.youtube.com/@AniOneID", "@AniOneID", "UC...")
     * @returns Channel details or null if resolution fails
     */
    async resolveChannelId(
        input: string
    ): Promise<{ channelId: string; channelName: string; handle: string; channelIcon: string | null } | null> {
        try {
            const cleanInput = input.trim();
            let handle = "";
            let targetUrl = "";

            // Check if input is direct channel ID starting with UC (24 characters)
            if (/^UC[a-zA-Z0-9_-]{22}$/.test(cleanInput)) {
                const channelId = cleanInput;
                const feed = await this.fetchFeed(channelId);
                const channelName = feed[0]?.channelName ?? `Channel ${channelId}`;
                const channelIcon = await this.getChannelIcon(channelId);
                return {
                    channelId,
                    channelName,
                    handle: `@${channelId}`,
                    channelIcon
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
                        const channelIcon = await this.getChannelIcon(candidateId);
                        return {
                            channelId: candidateId,
                            channelName,
                            handle: `@${candidateId}`,
                            channelIcon
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

            // Fetch YouTube page HTML to extract channelId, channel name, and channel icon
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

            // Extract channel avatar icon URL
            let channelIcon: string | null = null;
            const ogImageMatch =
                html.match(/meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                html.match(/link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i);
            if (ogImageMatch?.[1]) {
                channelIcon = ogImageMatch[1];
                this.channelIconCache.set(channelId, channelIcon);
            }

            return {
                channelId,
                channelName,
                handle: handle || `@${channelId}`,
                channelIcon
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
     * Fetch video status metadata (Upcoming, Live, or Regular Video) and scheduled start time.
     * @param videoId Unique YouTube video ID
     */
    async fetchVideoStatus(
        videoId: string
    ): Promise<{ statusType: YouTubeVideoStatusType; scheduledStartTimeUnix: number | null }> {
        try {
            const url = `https://www.youtube.com/watch?v=${videoId}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            let html = "";
            try {
                const response = await fetch(url, {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept-Language": "en-US,en;q=0.9"
                    },
                    signal: controller.signal
                });

                if (!response.ok) {
                    return { statusType: "video", scheduledStartTimeUnix: null };
                }

                html = await response.text();
            } finally {
                clearTimeout(timeoutId);
            }

            // Extract scheduled start time from HTML meta or JSON
            let scheduledStartTimeUnix: number | null = null;
            const startDateMatch =
                html.match(/meta\s+itemprop=["']startDate["']\s+content=["']([^"']+)["']/i) ||
                html.match(/["']startTimestamp["']\s*:\s*["']([^"']+)["']/);

            if (startDateMatch?.[1]) {
                const dateObj = new Date(startDateMatch[1]);
                if (!isNaN(dateObj.getTime())) {
                    scheduledStartTimeUnix = Math.floor(dateObj.getTime() / 1000);
                }
            }

            // Check if live now
            const isLiveNowMatch = html.match(/["']isLiveNow["']\s*:\s*true/i);
            if (isLiveNowMatch) {
                return { statusType: "live", scheduledStartTimeUnix };
            }

            // Check if upcoming
            const isUpcomingMatch =
                html.match(/["']upcomingEventData["']|["']isUpcoming["']\s*:\s*true/i) ||
                html.match(/meta\s+itemprop=["']isLiveBroadcast["']\s+content=["']True["']/i);

            const nowUnix = Math.floor(Date.now() / 1000);

            if (isUpcomingMatch || (scheduledStartTimeUnix && scheduledStartTimeUnix > nowUnix)) {
                return { statusType: "upcoming", scheduledStartTimeUnix };
            }

            return { statusType: "video", scheduledStartTimeUnix };
        } catch {
            return { statusType: "video", scheduledStartTimeUnix: null };
        }
    }

    /**
     * Get or fetch channel avatar icon URL.
     * @param channelId YouTube channel ID
     * @param handle YouTube channel handle
     */
    async getChannelIcon(channelId: string, handle?: string): Promise<string | null> {
        if (this.channelIconCache.has(channelId)) {
            return this.channelIconCache.get(channelId)!;
        }

        try {
            const targetUrl = handle
                ? `https://www.youtube.com/${handle}`
                : `https://www.youtube.com/channel/${channelId}`;
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            let html = "";
            try {
                const response = await fetch(targetUrl, {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                    },
                    signal: controller.signal
                });
                if (response.ok) {
                    html = await response.text();
                }
            } finally {
                clearTimeout(timeoutId);
            }

            const ogImageMatch =
                html.match(/meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                html.match(/link\s+rel=["']image_src["']\s+href=["']([^"']+)["']/i);

            if (ogImageMatch?.[1]) {
                const iconUrl = ogImageMatch[1];
                this.channelIconCache.set(channelId, iconUrl);
                return iconUrl;
            }
        } catch {
            // Ignore error and fall back to null
        }
        return null;
    }

    /**
     * Formats a raw YouTube feed entry for Discord embed consumption.
     * @param entry Raw entry
     * @param statusInfo Optional video status info (statusType, scheduledStartTimeUnix)
     * @param channelIcon Optional channel avatar icon URL
     */
    formatEntry(
        entry: YouTubeFeedEntry,
        statusInfo: { statusType: YouTubeVideoStatusType; scheduledStartTimeUnix: number | null } = {
            statusType: "video",
            scheduledStartTimeUnix: null
        },
        channelIcon: string | null = null
    ): FormattedYouTubeVideo {
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

        const thumbnail = entry.videoId
            ? `https://i.ytimg.com/vi/${entry.videoId}/maxresdefault.jpg`
            : entry.thumbnail
              ? entry.thumbnail.replace(
                    /\/(hqdefault|mqdefault|sddefault|default|hqdefault_live)\.jpg/g,
                    "/maxresdefault.jpg"
                )
              : null;

        return {
            videoId: entry.videoId,
            title,
            videoUrl,
            thumbnail,
            channelName: entry.channelName || "YouTube",
            channelUrl,
            channelIcon: channelIcon || this.channelIconCache.get(entry.channelId) || null,
            publishedAt: publishedDate,
            publishedUnix,
            description,
            statusType: statusInfo.statusType,
            scheduledStartTimeUnix: statusInfo.scheduledStartTimeUnix,
            wasPosted: false
        };
    }
}
