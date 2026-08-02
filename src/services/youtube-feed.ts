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
            let initialHandle = "";
            let targetUrl = "";

            // Check if input is direct channel ID starting with UC (24 characters)
            if (/^UC[a-zA-Z0-9_-]{22}$/.test(cleanInput)) {
                targetUrl = `https://www.youtube.com/channel/${cleanInput}`;
            } else if (cleanInput.startsWith("http://") || cleanInput.startsWith("https://")) {
                targetUrl = cleanInput;
                const urlObj = new URL(cleanInput);
                const pathname = urlObj.pathname;

                if (pathname.startsWith("/@")) {
                    initialHandle = pathname.substring(1); // e.g. "@AniOneID"
                } else if (pathname.startsWith("/channel/")) {
                    const candidateId = pathname.split("/")[2];
                    if (candidateId && /^UC[a-zA-Z0-9_-]{22}$/.test(candidateId)) {
                        targetUrl = `https://www.youtube.com/channel/${candidateId}`;
                    }
                }
            } else if (cleanInput.startsWith("@")) {
                initialHandle = cleanInput;
                targetUrl = `https://www.youtube.com/${initialHandle}`;
            } else {
                initialHandle = `@${cleanInput}`;
                targetUrl = `https://www.youtube.com/${initialHandle}`;
            }

            // Fetch YouTube page HTML to extract channelId, channel name, handle, and icon
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
            let channelId: string | null = /^UC[a-zA-Z0-9_-]{22}$/.test(cleanInput) ? cleanInput : null;

            if (!channelId) {
                const metaIdMatch =
                    html.match(
                        /meta\s+itemprop=["'](?:channelId|identifier)["']\s+content=["'](UC[a-zA-Z0-9_-]{22})["']/i
                    ) ||
                    html.match(
                        /meta\s+content=["'](UC[a-zA-Z0-9_-]{22})["']\s+itemprop=["'](?:channelId|identifier)["']/i
                    );

                if (metaIdMatch?.[1]) {
                    channelId = metaIdMatch[1];
                }
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

            // Extract canonical handle (@AniOneID)
            let handle = initialHandle;
            const handleMatch =
                html.match(/["']vanityChannelUrl["']\s*:\s*["']https?:\/\/[^"']+\/(@[a-zA-Z0-9_.-]+)["']/i) ||
                html.match(/["']canonicalChannelUrl["']\s*:\s*["']https?:\/\/[^"']+\/(@[a-zA-Z0-9_.-]+)["']/i) ||
                html.match(
                    /link\s+rel=["']canonical["']\s+href=["']https?:\/\/www\.youtube\.com\/(@[a-zA-Z0-9_.-]+)["']/i
                ) ||
                html.match(
                    /meta\s+property=["']og:url["']\s+content=["']https?:\/\/www\.youtube\.com\/(@[a-zA-Z0-9_.-]+)["']/i
                );

            if (handleMatch?.[1]) {
                handle = handleMatch[1];
            } else if (!handle) {
                handle = `@${channelId}`;
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
                handle,
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
     * Web Scrape YouTube channel /videos tab for public & members-only preview videos.
     * @param channelIdOrHandle YouTube channel ID (UC...) or handle (@...)
     * @param region Country code for localization & geo-bypass (e.g. ID, JP, US, SG)
     */
    async fetchVideosFromWeb(channelIdOrHandle: string, region: string = "ID"): Promise<YouTubeFeedEntry[]> {
        const entries: YouTubeFeedEntry[] = [];
        try {
            const cleanRegion = region === "GLOBAL" ? "US" : region;
            const hlMap: Record<string, string> = {
                ID: "id",
                JP: "ja",
                US: "en",
                SG: "en",
                TW: "zh-TW",
                HK: "zh-HK",
                KR: "ko",
                GLOBAL: "en"
            };
            const hl = hlMap[region] || "id";

            const targetUrl = channelIdOrHandle.startsWith("UC")
                ? `https://www.youtube.com/channel/${channelIdOrHandle}/videos?gl=${cleanRegion}&hl=${hl}`
                : `https://www.youtube.com/${channelIdOrHandle.startsWith("@") ? channelIdOrHandle : `@${channelIdOrHandle}`}/videos?gl=${cleanRegion}&hl=${hl}`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 12000);

            let html = "";
            try {
                const response = await fetch(targetUrl, {
                    headers: {
                        "User-Agent":
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                        "Accept-Language": `${hl};q=0.9,en-US;q=0.8,en;q=0.7`,
                        Cookie: `PREF=f6=40000000&gl=${cleanRegion}&hl=${hl};`
                    },
                    signal: controller.signal
                });

                if (!response.ok) return entries;
                html = await response.text();
            } finally {
                clearTimeout(timeoutId);
            }

            const match =
                html.match(/var\s+ytInitialData\s*=\s*({.*?});<\/script>/s) ||
                html.match(/window\[["']ytInitialData["']\]\s*=\s*({.*?});<\/script>/s);

            if (!match || !match[1]) return entries;

            const data = JSON.parse(match[1]);
            const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || [];

            let videoTab = tabs.find(
                (t: any) =>
                    t?.tabRenderer?.selected ||
                    t?.tabRenderer?.title === "Video" ||
                    t?.tabRenderer?.title === "Videos" ||
                    t?.tabRenderer?.endpoint?.commandMetadata?.webCommandMetadata?.url?.includes("/videos")
            );

            if (!videoTab) {
                videoTab = tabs.find((t: any) => t?.tabRenderer?.content?.richGridRenderer?.contents?.length > 0);
            }

            const contents = videoTab?.tabRenderer?.content?.richGridRenderer?.contents || [];

            for (const item of contents) {
                const content = item?.richItemRenderer?.content;
                if (!content) continue;

                let videoId = "";
                let title = "";
                let isMembersOnly = false;
                const published = new Date().toISOString();

                if (content.lockupViewModel) {
                    const vm = content.lockupViewModel;
                    videoId = vm.contentId;
                    title = vm.metadata?.lockupMetadataViewModel?.title?.content || "";

                    const badgeList = vm.metadata?.lockupMetadataViewModel?.badgeViewModels || [];
                    for (const b of badgeList) {
                        const label = b?.badgeViewModel?.label || "";
                        if (
                            label.includes("Pelanggan") ||
                            label.includes("Members") ||
                            label.includes("Member") ||
                            label.includes("Exclusive") ||
                            label.includes("メンバー限定") ||
                            label.includes("會員") ||
                            label.includes("멤버십")
                        ) {
                            isMembersOnly = true;
                        }
                    }
                } else if (content.videoRenderer) {
                    const vr = content.videoRenderer;
                    videoId = vr.videoId;
                    title = vr.title?.runs?.[0]?.text || "";

                    if (vr.badges) {
                        for (const b of vr.badges) {
                            const label = b?.metadataBadgeRenderer?.label || "";
                            const style = b?.metadataBadgeRenderer?.style || "";
                            if (
                                style === "BADGE_STYLE_TYPE_MEMBERS_ONLY" ||
                                label.includes("Pelanggan") ||
                                label.includes("Members") ||
                                label.includes("メンバー限定") ||
                                label.includes("會員") ||
                                label.includes("멤버십")
                            ) {
                                isMembersOnly = true;
                            }
                        }
                    }
                }

                if (videoId && title) {
                    entries.push({
                        videoId,
                        title,
                        channelId: channelIdOrHandle,
                        channelName: "",
                        published,
                        updated: published,
                        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
                        description: isMembersOnly ? "🟢 Konten khusus pelanggan (Members-only / Early Access)." : "",
                        link: `https://www.youtube.com/watch?v=${videoId}`
                    });
                }
            }
        } catch (err) {
            logger.error(err, `Error web scraping YouTube videos for ${channelIdOrHandle}`);
        }
        return entries;
    }

    /**
     * Fetch video status metadata (Upcoming, Live, Members-Only, or Regular Video) and scheduled start time.
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

            // Check if members only from YouTube player JSON / badges
            const isMembersOnlyMatch =
                html.match(/["']isMembersOnly["']\s*:\s*true/i) || html.match(/BADGE_STYLE_TYPE_MEMBERS_ONLY/i);

            // Extract scheduled start time from HTML meta or JSON
            let scheduledStartTimeUnix: number | null = null;
            const startDateMatch =
                html.match(/meta\s+itemprop=["']startDate["']\s+content=["']([^"']+)["']/i) ||
                html.match(/["']startTimestamp["']\s*:\s*["']([^"']+)["']/);

            if (startDateMatch?.[1]) {
                const dateStr = startDateMatch[1];
                const dateObj = new Date(dateStr);
                if (!isNaN(dateObj.getTime())) {
                    scheduledStartTimeUnix = Math.floor(dateObj.getTime() / 1000);
                }
            }

            if (isMembersOnlyMatch) {
                return { statusType: "members_only", scheduledStartTimeUnix };
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
