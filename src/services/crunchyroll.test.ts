import { describe, expect, test, mock } from "bun:test";
import { CrunchyrollService } from "./crunchyroll";
import { config } from "../config";

describe("CrunchyrollService subtitle functions", () => {
    const service = new CrunchyrollService();

    test("sanitizeSubtitleUrl replaces vod-fy-mod.crunchyrollcdn.com with vod-fy.crunchyrollcdn.com", () => {
        const inputUrl = "https://vod-fy-mod.crunchyrollcdn.com/v1/AUTH_cr/subtitles/abc123.ass";
        const expectedUrl = "https://vod-fy.crunchyrollcdn.com/v1/AUTH_cr/subtitles/abc123.ass";
        expect(service.sanitizeSubtitleUrl(inputUrl)).toBe(expectedUrl);
    });

    test("sanitizeSubtitleUrl leaves normal URLs unchanged", () => {
        const normalUrl = "https://vod-fy.crunchyrollcdn.com/v1/AUTH_cr/subtitles/abc123.ass";
        expect(service.sanitizeSubtitleUrl(normalUrl)).toBe(normalUrl);
    });

    test("downloadSubtitle replaces modified CDN domain before fetching content", async () => {
        let requestedUrl = "";
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            requestedUrl = url.toString();
            return new Response("[Script Info]\nTitle: Test Subtitle", { status: 200 });
        }) as unknown as typeof globalThis.fetch;

        try {
            const inputUrl = "https://vod-fy-mod.crunchyrollcdn.com/subtitles/test.ass";
            const content = await service.downloadSubtitle(inputUrl);

            expect(requestedUrl).toBe("https://vod-fy.crunchyrollcdn.com/subtitles/test.ass");
            expect(content).toBe("[Script Info]\nTitle: Test Subtitle");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("downloadSubtitle retries replacing vod-fy-mod. with vod-fy. on 403 Forbidden status", async () => {
        const requestedUrls: string[] = [];
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            const str = url.toString();
            requestedUrls.push(str);
            if (str.includes("vod-fy-mod.")) {
                return new Response("Forbidden", { status: 403 });
            }
            return new Response("[Script Info]\nTitle: Fallback Subtitle", { status: 200 });
        }) as unknown as typeof globalThis.fetch;

        try {
            const inputUrl = "https://vod-fy-mod.crunchyrollcdn.com/subtitles/test.txt?format=ass";
            const content = await service.downloadSubtitle(inputUrl);

            expect(content).toBe("[Script Info]\nTitle: Fallback Subtitle");
            expect(requestedUrls).toContain("https://vod-fy.crunchyrollcdn.com/subtitles/test.txt?format=ass");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("fetchSubtitles sanitizes returned subtitle URLs in response", async () => {
        config.crunchyroll.email = "test@example.com";
        config.crunchyroll.password = "testpass";
        const originalFetch = globalThis.fetch;

        // Mock account auth and play service response
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes("/auth/v1/token")) {
                return new Response(
                    JSON.stringify({
                        access_token: "fake_token",
                        expires_in: 3600
                    }),
                    { status: 200 }
                );
            }
            if (urlStr.includes("/play")) {
                return new Response(
                    JSON.stringify({
                        subtitles: {
                            "en-US": {
                                locale: "en-US",
                                url: "https://vod-fy-mod.crunchyrollcdn.com/subtitles/en.ass",
                                format: "txt"
                            }
                        }
                    }),
                    { status: 200 }
                );
            }
            return new Response(null, { status: 404 });
        }) as unknown as typeof globalThis.fetch;

        try {
            const subtitles = await service.fetchSubtitles("GEXH3WP91");
            expect(subtitles).not.toBeNull();
            expect(subtitles?.["en-US"]?.url).toBe("https://vod-fy.crunchyrollcdn.com/subtitles/en.ass");
            expect(subtitles?.["en-US"]?.format).toBe("ass");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
