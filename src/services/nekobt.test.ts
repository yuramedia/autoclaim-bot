import { describe, expect, test, mock, afterEach } from "bun:test";
import {
    extractNekoBTId,
    formatBytes,
    normalizeNekoBTUrl,
    parseNekoBTTimestamp,
    fetchNekoBTTorrent,
    buildNekoBTEmbed
} from "./nekobt";
import type { NekoBTTorrentResponse } from "../types";

describe("NekoBT Service Unit Tests", () => {
    describe("extractNekoBTId", () => {
        test("extracts ID correctly from standard URL", () => {
            const url = "https://nekobt.to/torrents/12345";
            expect(extractNekoBTId(url)).toBe("12345");
        });

        test("extracts ID correctly from URL with www", () => {
            const url = "http://www.nekobt.to/torrents/98765";
            expect(extractNekoBTId(url)).toBe("98765");
        });

        test("returns null for non-matching URLs", () => {
            expect(extractNekoBTId("https://example.com/12345")).toBeNull();
            expect(extractNekoBTId("https://nekobt.to/users/123")).toBeNull();
        });
    });

    describe("formatBytes", () => {
        test("formats zero bytes", () => {
            expect(formatBytes(0)).toBe("0 Bytes");
        });

        test("formats kilobytes", () => {
            expect(formatBytes(1024)).toBe("1 KiB");
        });

        test("formats megabytes", () => {
            expect(formatBytes(1048576 * 500)).toBe("500 MiB");
        });

        test("formats gigabytes with decimals", () => {
            expect(formatBytes(1073741824 * 2.5)).toBe("2.5 GiB");
        });
    });

    describe("normalizeNekoBTUrl", () => {
        test("returns null for empty or undefined input", () => {
            expect(normalizeNekoBTUrl(null)).toBeNull();
            expect(normalizeNekoBTUrl(undefined)).toBeNull();
            expect(normalizeNekoBTUrl("")).toBeNull();
        });

        test("returns full https/http URLs unchanged", () => {
            expect(normalizeNekoBTUrl("https://example.com/img.png")).toBe("https://example.com/img.png");
            expect(normalizeNekoBTUrl("http://example.com/img.png")).toBe("http://example.com/img.png");
        });

        test("prefixes relative slash paths with domain", () => {
            expect(normalizeNekoBTUrl("/cdn/pfp/abc.png")).toBe("https://nekobt.to/cdn/pfp/abc.png");
        });

        test("handles protocol-relative URLs", () => {
            expect(normalizeNekoBTUrl("//cdn.nekobt.to/img.png")).toBe("https://cdn.nekobt.to/img.png");
        });
    });

    describe("parseNekoBTTimestamp", () => {
        test("returns null for invalid inputs", () => {
            expect(parseNekoBTTimestamp(null)).toBeNull();
            expect(parseNekoBTTimestamp(undefined)).toBeNull();
            expect(parseNekoBTTimestamp("invalid-date")).toBeNull();
        });

        test("converts Unix seconds to milliseconds Date", () => {
            const unixSeconds = 1700000000;
            const parsed = parseNekoBTTimestamp(unixSeconds);
            expect(parsed).not.toBeNull();
            expect(parsed?.getTime()).toBe(1700000000000);
        });

        test("handles Unix milliseconds Date directly", () => {
            const unixMs = 1700000000000;
            const parsed = parseNekoBTTimestamp(unixMs);
            expect(parsed).not.toBeNull();
            expect(parsed?.getTime()).toBe(1700000000000);
        });

        test("parses numeric strings in seconds", () => {
            const parsed = parseNekoBTTimestamp("1700000000");
            expect(parsed).not.toBeNull();
            expect(parsed?.getTime()).toBe(1700000000000);
        });

        test("parses ISO date strings", () => {
            const iso = "2024-01-01T00:00:00.000Z";
            const parsed = parseNekoBTTimestamp(iso);
            expect(parsed).not.toBeNull();
            expect(parsed?.toISOString()).toBe(iso);
        });
    });

    describe("fetchNekoBTTorrent & buildNekoBTEmbed", () => {
        const originalFetch = global.fetch;

        afterEach(() => {
            global.fetch = originalFetch;
        });

        test("fetchNekoBTTorrent returns metadata on success", async () => {
            const mockResponse: NekoBTTorrentResponse = {
                error: false,
                data: {
                    id: "12345",
                    uploaded_at: 1700000000,
                    title: "[Group] Test Anime - 01 [1080p]",
                    filesize: "524288000",
                    magnet: "magnet:?xt=urn:btih:1234567890abcdef",
                    infohash: "1234567890abcdef",
                    seeders: "10",
                    leechers: "2",
                    completed: "50",
                    screenshots: ["/screens/1.png"],
                    uploader: {
                        id: "u1",
                        username: "testuser",
                        display_name: "Test User",
                        pfp_hash: "pfp123"
                    }
                }
            };

            global.fetch = mock(() =>
                Promise.resolve(
                    new Response(JSON.stringify(mockResponse), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                )
            ) as unknown as typeof global.fetch;

            const res = await fetchNekoBTTorrent("12345");
            expect(res).not.toBeNull();
            expect(res?.data.title).toBe("[Group] Test Anime - 01 [1080p]");
            expect(res?.data.infohash).toBe("1234567890abcdef");
        });

        test("buildNekoBTEmbed returns valid embed & button component", async () => {
            const mockResponse: NekoBTTorrentResponse = {
                error: false,
                data: {
                    id: "12345",
                    uploaded_at: 1700000000,
                    title: "[Group] Test Anime - 01 [1080p]",
                    filesize: 104857600,
                    magnet: "magnet:?xt=urn:btih:1234567890abcdef",
                    infohash: "1234567890abcdef",
                    seeders: 25,
                    leechers: 5,
                    completed: 100,
                    screenshots: ["/screens/1.png"],
                    uploader: {
                        id: "u1",
                        username: "testuser",
                        display_name: "Test User",
                        pfp_hash: "pfp123"
                    }
                }
            };

            global.fetch = mock(() =>
                Promise.resolve(
                    new Response(JSON.stringify(mockResponse), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    })
                )
            ) as unknown as typeof global.fetch;

            const result = await buildNekoBTEmbed("https://nekobt.to/torrents/12345");
            expect(result).not.toBeNull();
            expect(result?.embeds.length).toBe(1);

            const embed = result!.embeds[0]!;
            expect(embed.data.title).toBe("[Group] Test Anime - 01 [1080p]");

            expect(result?.components.length).toBe(1);
        });
    });
});
