import { describe, expect, test, mock, afterEach } from "bun:test";
import {
    parseTsukihimeTimestamp,
    extractTsukihimeImages,
    fetchTsukihimeTorrentByNyaa,
    fetchTsukihimeTorrentBySukebei,
    fetchTsukihimeTorrentByBtih,
    fetchTsukihimeTorrentById,
    buildTsukihimeEmbed
} from "./tsukihime";
import type { TsukihimeTorrent } from "../types";
import axios from "axios";

describe("Tsukihime Service Unit Tests", () => {
    describe("parseTsukihimeTimestamp", () => {
        test("returns null for invalid or null inputs", () => {
            expect(parseTsukihimeTimestamp(null)).toBeNull();
            expect(parseTsukihimeTimestamp(undefined)).toBeNull();
            expect(parseTsukihimeTimestamp("invalid")).toBeNull();
        });

        test("parses Unix seconds correctly", () => {
            const parsed = parseTsukihimeTimestamp(1700000000);
            expect(parsed).not.toBeNull();
            expect(parsed?.getTime()).toBe(1700000000000);
        });

        test("parses Unix milliseconds correctly", () => {
            const parsed = parseTsukihimeTimestamp(1700000000000);
            expect(parsed).not.toBeNull();
            expect(parsed?.getTime()).toBe(1700000000000);
        });

        test("parses ISO timestamp strings", () => {
            const iso = "2024-05-01T12:00:00.000Z";
            const parsed = parseTsukihimeTimestamp(iso);
            expect(parsed).not.toBeNull();
            expect(parsed?.toISOString()).toBe(iso);
        });
    });

    describe("extractTsukihimeImages", () => {
        test("extracts anime metadata, group, and vidframe screenshots", () => {
            const torrent: TsukihimeTorrent = {
                id: 100,
                has_nzb: 1,
                main_source: 1,
                nyaa_id: 12345,
                sukebei_id: 0,
                nekobt_id: 0,
                name: "[SubsPlease] Anime Title - 01 [1080p].mkv",
                btih: "aabbccdd11223344",
                is_adult: 0,
                totalsize: 500000000,
                filecount: 1,
                audiolangs: ["ja"],
                sublangs: ["en"],
                episode_no: 1,
                source_date: 1700000000,
                added_date: 1700000000,
                state: "completed",
                anime: {
                    id: 1,
                    title: "Anime Native Title",
                    english_title: "Anime English Title",
                    thumbnail: "https://cdn.anilist.co/cover.jpg",
                    synopsis: "Anime synopsis",
                    genres: ["Action", "Sci-Fi"],
                    studios: ["Bones"],
                    release_year: 2024,
                    anilist: 12345,
                    mal: 6789,
                    anidb: 1011
                },
                group: {
                    id: 10,
                    name: "SubsPlease"
                },
                files: [
                    {
                        id: 255,
                        state: "completed",
                        torrent_id: 100,
                        filename: "video.mkv",
                        size: 500000000,
                        vidframes: [1, 2, 3],
                        links_audio: {},
                        links: {
                            Gofile: "https://gofile.io/d/123"
                        },
                        attachments: [],
                        crc32: null,
                        md5: null,
                        sha1: null,
                        ed2k: null
                    }
                ]
            };

            const images = extractTsukihimeImages(torrent);
            expect(images.cover).toBe("https://cdn.anilist.co/cover.jpg");
            expect(images.animeTitle).toBe("Anime English Title");
            expect(images.genres).toEqual(["Action", "Sci-Fi"]);
            expect(images.studios).toEqual(["Bones"]);
            expect(images.groupName).toBe("SubsPlease");
            expect(images.screenshots).toHaveLength(3);
            expect(images.screenshots[0]).toBe("https://storage.tsukihime.org/sframes/000000ff_1.webp");
        });
    });

    describe("API Fetchers with Axios Mocking", () => {
        const originalGet = axios.get;

        afterEach(() => {
            axios.get = originalGet;
        });

        test("fetchTsukihimeTorrentByNyaa returns torrent object", async () => {
            const mockTorrent: Partial<TsukihimeTorrent> = {
                id: 100,
                name: "[Test] Nyaa Torrent",
                nyaa_id: 12345
            };

            axios.get = mock(() => Promise.resolve({ data: mockTorrent, status: 200 })) as typeof axios.get;

            const res = await fetchTsukihimeTorrentByNyaa(12345);
            expect(res).not.toBeNull();
            expect(res?.id).toBe(100);
            expect(res?.name).toBe("[Test] Nyaa Torrent");
        });

        test("fetchTsukihimeTorrentBySukebei returns torrent object", async () => {
            const mockTorrent: Partial<TsukihimeTorrent> = {
                id: 102,
                name: "[Test] Sukebei Torrent",
                sukebei_id: 54321
            };

            axios.get = mock(() => Promise.resolve({ data: mockTorrent, status: 200 })) as typeof axios.get;

            const res = await fetchTsukihimeTorrentBySukebei(54321);
            expect(res).not.toBeNull();
            expect(res?.id).toBe(102);
            expect(res?.name).toBe("[Test] Sukebei Torrent");
        });

        test("fetchTsukihimeTorrentById returns torrent object", async () => {
            const mockTorrent: Partial<TsukihimeTorrent> = {
                id: 500,
                name: "[Test] ID Torrent"
            };

            axios.get = mock(() => Promise.resolve({ data: mockTorrent, status: 200 })) as typeof axios.get;

            const res = await fetchTsukihimeTorrentById(500);
            expect(res).not.toBeNull();
            expect(res?.id).toBe(500);
        });

        test("fetchTsukihimeTorrentByBtih returns torrent object", async () => {
            const mockTorrent: Partial<TsukihimeTorrent> = {
                id: 101,
                name: "[Test] BTIH Torrent",
                btih: "1234567890abcdef1234567890abcdef12345678"
            };

            axios.get = mock(() => Promise.resolve({ data: mockTorrent, status: 200 })) as typeof axios.get;

            const res = await fetchTsukihimeTorrentByBtih("1234567890abcdef1234567890abcdef12345678");
            expect(res).not.toBeNull();
            expect(res?.id).toBe(101);
        });

        test("buildTsukihimeEmbed returns embed, action buttons, and files array", async () => {
            const mockTorrent: TsukihimeTorrent = {
                id: 50,
                has_nzb: 1,
                main_source: 1,
                nyaa_id: 999,
                sukebei_id: 0,
                nekobt_id: 0,
                name: "[Group] Sample Anime - 01",
                btih: "abcdef123456",
                is_adult: 0,
                totalsize: 1000000,
                filecount: 1,
                audiolangs: ["ja"],
                sublangs: ["en"],
                episode_no: 1,
                source_date: 1700000000,
                added_date: 1700000000,
                state: "completed",
                anime: {
                    id: 1,
                    title: "Sample Anime",
                    english_title: "Sample Anime English",
                    thumbnail: "https://cover.jpg",
                    synopsis: null,
                    genres: ["Drama"],
                    studios: ["Mappa"],
                    release_year: 2024,
                    anilist: 123,
                    mal: 456,
                    anidb: 789
                },
                group: { id: 5, name: "SampleGroup" },
                trackers: [
                    {
                        tier: 1,
                        lastupdate: 1700000000,
                        seeders: 50,
                        leechers: 10,
                        complete: 200,
                        error: 0,
                        url: "http://tr.cc"
                    }
                ]
            };

            axios.get = mock(() => Promise.resolve({ data: mockTorrent, status: 200 })) as typeof axios.get;

            const result = await buildTsukihimeEmbed(50, "https://tsukihime.org/torrents/50");
            expect(result).not.toBeNull();
            expect(result?.embeds).toHaveLength(1);
            expect(result?.embeds[0]?.data.title).toBe("[Group] Sample Anime - 01");
            expect(result?.components.length).toBeGreaterThan(0);
        });
    });
});
