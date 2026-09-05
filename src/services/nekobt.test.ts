import { describe, expect, test, mock, afterEach } from "bun:test";
import {
    extractNekoBTId,
    formatBytes,
    normalizeNekoBTUrl,
    parseNekoBTTimestamp,
    fetchNekoBTTorrent,
    buildNekoBTEmbed
} from "./nekobt";
import axios from "axios";
import type { NekoBTTorrentResponse, TsukihimeTorrent } from "../types";

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
        const originalAxiosGet = axios.get;

        afterEach(() => {
            global.fetch = originalFetch;
            axios.get = originalAxiosGet;
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

        test("buildNekoBTEmbed returns valid embed & button component with Tsukihime metadata", async () => {
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

            const mockTsukihimeTorrent: TsukihimeTorrent = {
                id: 1,
                has_nzb: 0,
                main_source: 1,
                nyaa_id: 0,
                sukebei_id: 0,
                nekobt_id: 12345,
                name: "[Group] Test Anime - 01 [1080p]",
                btih: "1234567890abcdef",
                is_adult: 0,
                totalsize: 104857600,
                filecount: 1,
                audiolangs: ["ja"],
                sublangs: ["en"],
                episode_no: 1,
                source_date: 1700000000,
                added_date: 1700000000,
                state: "completed",
                group: null,
                anime: {
                    id: 10,
                    title: "Test Anime",
                    english_title: "Test Anime EN",
                    thumbnail: "https://cover.example.com/test.jpg",
                    synopsis: "Synopsis for test anime",
                    genres: ["Action"],
                    studios: ["Studio Test"],
                    release_year: 2024,
                    anilist: 1234,
                    mal: 5678,
                    anidb: 9101
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

            axios.get = mock(() =>
                Promise.resolve({
                    data: mockTsukihimeTorrent,
                    status: 200
                })
            ) as typeof axios.get;

            const result = await buildNekoBTEmbed("https://nekobt.to/torrents/12345");
            expect(result).not.toBeNull();
            expect(result?.embeds.length).toBe(1);

            const embed = result!.embeds[0]!;
            expect(embed.data.title).toBe("[Group] Test Anime - 01 [1080p]");
            expect(embed.data.thumbnail?.url).toBe("https://cover.example.com/test.jpg");
            expect(result?.components.length).toBe(1);
        });

        test("buildNekoBTEmbed handles Tsukihime miss with fallback gracefully", async () => {
            const mockResponse: NekoBTTorrentResponse = {
                error: false,
                data: {
                    id: "67890",
                    uploaded_at: 1700000000,
                    title: "Unknown Anime",
                    filesize: 104857600,
                    magnet: "magnet:?xt=urn:btih:fedcba0987654321",
                    infohash: "fedcba0987654321",
                    seeders: 5,
                    leechers: 1,
                    completed: 20,
                    screenshots: ["/screens/2.png"],
                    uploader: {
                        id: "u2",
                        username: "uploader2",
                        display_name: "Uploader Two",
                        pfp_hash: "pfp456"
                    }
                }
            };

            global.fetch = mock(async (url: string | URL | Request) => {
                const urlStr = url.toString();
                if (urlStr.includes("/torrents/67890")) {
                    return new Response(JSON.stringify(mockResponse), {
                        status: 200,
                        headers: { "Content-Type": "application/json" }
                    });
                }
                return new Response(null, { status: 404 });
            }) as unknown as typeof global.fetch;

            axios.get = mock(() => Promise.reject(new Error("Tsukihime 404 Not Found"))) as typeof axios.get;

            const result = await buildNekoBTEmbed("https://nekobt.to/torrents/67890");
            expect(result).not.toBeNull();
            expect(result?.embeds.length).toBe(1);
            expect(result?.embeds[0]?.data.title).toBe("Unknown Anime");
            expect(result?.components.length).toBe(1);
        });
    });
});
