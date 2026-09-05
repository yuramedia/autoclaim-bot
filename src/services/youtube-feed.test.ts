import { describe, test, expect, mock, beforeEach } from "bun:test";
import { YouTubeFeedService } from "./youtube-feed";
import type { YouTubeFeedEntry } from "../types/youtube-feed";

describe("YouTubeFeedService", () => {
    let service: YouTubeFeedService;

    beforeEach(() => {
        service = new YouTubeFeedService();
    });

    describe("parseAtomFeed (via fetchFeed)", () => {
        const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UC1234567890123456789012"/>
 <id>yt:channel:UC1234567890123456789012</id>
 <yt:channelId>UC1234567890123456789012</yt:channelId>
 <title>Anime Channel Official</title>
 <author>
  <name>Anime Channel Official</name>
  <uri>https://www.youtube.com/channel/UC1234567890123456789012</uri>
 </author>
 <published>2026-03-01T10:00:00+00:00</published>
 <entry>
  <id>yt:video:dQw4w9WgXcQ</id>
  <yt:videoId>dQw4w9WgXcQ</yt:videoId>
  <yt:channelId>UC1234567890123456789012</yt:channelId>
  <title>Episode 1 Premiere &amp; Highlights</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"/>
  <author>
   <name>Anime Channel Official</name>
   <uri>https://www.youtube.com/channel/UC1234567890123456789012</uri>
  </author>
  <published>2026-03-05T12:00:00+00:00</published>
  <updated>2026-03-05T12:30:00+00:00</updated>
  <media:group>
   <media:title>Episode 1 Premiere &amp; Highlights</media:title>
   <media:thumbnail url="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" width="480" height="360"/>
   <media:description>Watch the official episode 1 streaming now!</media:description>
  </media:group>
 </entry>
 <entry>
  <id>yt:video:abc123xyz89</id>
  <yt:videoId>abc123xyz89</yt:videoId>
  <yt:channelId>UC1234567890123456789012</yt:channelId>
  <title>Episode 2 Teaser</title>
  <link rel="alternate" href="https://www.youtube.com/watch?v=abc123xyz89"/>
  <author>
   <name>Anime Channel Official</name>
  </author>
  <published>2026-03-06T08:00:00+00:00</published>
  <updated>2026-03-06T08:00:00+00:00</updated>
  <media:group>
   <media:thumbnail url="https://i.ytimg.com/vi/abc123xyz89/hqdefault.jpg"/>
   <media:description>Teaser for upcoming episode</media:description>
  </media:group>
 </entry>
</feed>`;

        test("parses entries correctly with namespaces and media group", async () => {
            // Mock fetchWithTimeout
            (service as any).fetchWithTimeout = mock(async () => sampleXml);

            const entries = await service.fetchFeed("UC1234567890123456789012");
            expect(entries).toHaveLength(2);

            const first = entries[0]!;
            expect(first.videoId).toBe("dQw4w9WgXcQ");
            expect(first.title).toBe("Episode 1 Premiere & Highlights");
            expect(first.channelId).toBe("UC1234567890123456789012");
            expect(first.channelName).toBe("Anime Channel Official");
            expect(first.published).toBe("2026-03-05T12:00:00+00:00");
            expect(first.updated).toBe("2026-03-05T12:30:00+00:00");
            expect(first.thumbnail).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg");
            expect(first.description).toBe("Watch the official episode 1 streaming now!");
            expect(first.link).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

            const second = entries[1]!;
            expect(second.videoId).toBe("abc123xyz89");
            expect(second.title).toBe("Episode 2 Teaser");
        });

        test("handles empty or malformed XML gracefully", async () => {
            (service as any).fetchWithTimeout = mock(async () => "<invalid>not xml");
            const entries = await service.fetchFeed("UC1234567890123456789012");
            expect(entries).toEqual([]);
        });

        test("handles network fetch failure returning null", async () => {
            (service as any).fetchWithTimeout = mock(async () => null);
            const entries = await service.fetchFeed("UC1234567890123456789012");
            expect(entries).toEqual([]);
        });
    });

    describe("fetchVideoStatus", () => {
        test("detects members-only video from badge or JSON", async () => {
            const html = `<html><head><meta property="og:title" content="Exclusive Member Stream"></head>
            <body><script>var ytInitialData = {"isMembersOnly": true};</script></body></html>`;
            (service as any).fetchWithTimeout = mock(async () => html);

            const status = await service.fetchVideoStatus("member_vid_1");
            expect(status.statusType).toBe("members_only");
            expect(status.realTitle).toBe("Exclusive Member Stream");
        });

        test("detects live stream now", async () => {
            const html = `<html><head><meta property="og:title" content="Live Concert Stream"></head>
            <body><script>var ytInitialPlayerResponse = {"isLiveNow": true};</script></body></html>`;
            (service as any).fetchWithTimeout = mock(async () => html);

            const status = await service.fetchVideoStatus("live_vid_1");
            expect(status.statusType).toBe("live");
            expect(status.realTitle).toBe("Live Concert Stream");
        });

        test("detects upcoming premiere with numeric Unix startTimestamp", async () => {
            const futureTimestamp = Math.floor(Date.now() / 1000) + 7200; // 2 hours in future
            const html = `<html><head><meta property="og:title" content="Upcoming Premiere Ep 1"></head>
            <body><script>var ytInitialPlayerResponse = {"upcomingEventData": {"startTimestamp": "${futureTimestamp}"}};</script></body></html>`;
            (service as any).fetchWithTimeout = mock(async () => html);

            const status = await service.fetchVideoStatus("upcoming_vid_1");
            expect(status.statusType).toBe("upcoming");
            expect(status.scheduledStartTimeUnix).toBe(futureTimestamp);
            expect(status.realTitle).toBe("Upcoming Premiere Ep 1");
        });

        test("detects upcoming premiere with ISO startDate in meta tag", async () => {
            const futureDate = new Date(Date.now() + 86400000); // 1 day in future
            const iso = futureDate.toISOString();
            const expectedUnix = Math.floor(futureDate.getTime() / 1000);

            const html = `<html><head>
                <meta property="og:title" content="Upcoming Episode 5">
                <meta itemprop="startDate" content="${iso}">
            </head>
            <body><script>var ytInitialPlayerResponse = {"isUpcoming": true};</script></body></html>`;
            (service as any).fetchWithTimeout = mock(async () => html);

            const status = await service.fetchVideoStatus("upcoming_vid_2");
            expect(status.statusType).toBe("upcoming");
            expect(status.scheduledStartTimeUnix).toBe(expectedUnix);
        });

        test("detects regular video when not live, not upcoming, not members only", async () => {
            const html = `<html><head><meta property="og:title" content="Regular Video Upload"></head>
            <body><script>var ytInitialPlayerResponse = {"status": "OK"};</script></body></html>`;
            (service as any).fetchWithTimeout = mock(async () => html);

            const status = await service.fetchVideoStatus("reg_vid_1");
            expect(status.statusType).toBe("video");
            expect(status.realTitle).toBe("Regular Video Upload");
            expect(status.scheduledStartTimeUnix).toBeNull();
        });

        test("handles network timeout returning fallback video status", async () => {
            (service as any).fetchWithTimeout = mock(async () => null);
            const status = await service.fetchVideoStatus("error_vid");
            expect(status.statusType).toBe("video");
            expect(status.scheduledStartTimeUnix).toBeNull();
        });
    });

    describe("formatEntry", () => {
        const baseEntry: YouTubeFeedEntry = {
            videoId: "dQw4w9WgXcQ",
            title: "Never Gonna Give You Up &amp; Official Video",
            channelId: "UCuAXFkgsw1L7xaCfnd5JJOw",
            channelName: "Rick Astley",
            published: "2026-03-01T12:00:00+00:00",
            updated: "2026-03-01T12:00:00+00:00",
            thumbnail: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
            description: "Official Rick Astley Music Video &lt;3",
            link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        };

        test("decodes HTML entities in title and description", () => {
            const formatted = service.formatEntry(baseEntry);
            expect(formatted.title).toBe("Never Gonna Give You Up & Official Video");
            expect(formatted.description).toBe("Official Rick Astley Music Video <3");
            expect(formatted.videoUrl).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
            expect(formatted.channelUrl).toBe("https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw");
            expect(formatted.thumbnail).toBe("https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg");
            expect(formatted.statusType).toBe("video");
            expect(formatted.wasPosted).toBe(false);
        });

        test("handles invalid published date without creating NaN or Invalid Date", () => {
            const entryWithBadDate = {
                ...baseEntry,
                published: "[object Object]"
            };
            const formatted = service.formatEntry(entryWithBadDate);
            expect(formatted.publishedAt).toBeInstanceOf(Date);
            expect(isNaN(formatted.publishedAt.getTime())).toBe(false);
            expect(isNaN(formatted.publishedUnix)).toBe(false);
        });

        test("formats channelUrl correctly for @handles", () => {
            const entryWithHandle = {
                ...baseEntry,
                channelId: "@AniOneID"
            };
            const formatted = service.formatEntry(entryWithHandle);
            expect(formatted.channelUrl).toBe("https://www.youtube.com/@AniOneID");
        });

        test("overrides title with realTitle from statusInfo if provided", () => {
            const formatted = service.formatEntry(
                baseEntry,
                {
                    statusType: "live",
                    scheduledStartTimeUnix: 1741165200,
                    realTitle: "🔴 LIVE: Special Broadcast Event"
                },
                "https://avatar.url/pic.jpg"
            );
            expect(formatted.title).toBe("🔴 LIVE: Special Broadcast Event");
            expect(formatted.statusType).toBe("live");
            expect(formatted.scheduledStartTimeUnix).toBe(1741165200);
            expect(formatted.channelIcon).toBe("https://avatar.url/pic.jpg");
        });
    });

    describe("Channel Icon Caching", () => {
        test("sets and gets cached icon with TTL", () => {
            (service as any).setCachedIcon("UC12345", "https://icon.url/1.png");
            expect(service.getCachedIcon("UC12345")).toBe("https://icon.url/1.png");
            expect(service.getCachedIcon("UC_NON_EXISTENT")).toBeNull();
        });
    });
});
