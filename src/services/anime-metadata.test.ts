import { describe, expect, test, mock } from "bun:test";
import {
    searchAnime,
    fetchAnimeByAnilistId,
    fetchAnimeByMalId,
    fetchAnimeByAnidbId,
    getRedirectUrl
} from "./anime-metadata";
import { ANIME_API_URL } from "../constants/anime";

describe("animeApi.my.id metadata service", () => {
    test("searchAnime returns correct URLs and IDs on successful slug match", async () => {
        const mockResponse = {
            title: "Frieren: Beyond Journey's End",
            myanimelist: 52991,
            anilist: 154587
        };

        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            const urlStr = url.toString();
            if (urlStr.includes(`${ANIME_API_URL}/animeplanet/frieren-beyond-journey-s-end`)) {
                return new Response(JSON.stringify(mockResponse), { status: 200 });
            }
            return new Response(null, { status: 404 });
        }) as unknown as typeof globalThis.fetch;

        try {
            const result = await searchAnime("Frieren: Beyond Journey's End");
            expect(result).not.toBeNull();
            expect(result?.title).toBe("Frieren: Beyond Journey's End");
            expect(result?.malId).toBe(52991);
            expect(result?.anilistId).toBe(154587);
            expect(result?.malUrl).toBe("https://myanimelist.net/anime/52991");
            expect(result?.anilistUrl).toBe("https://anilist.co/anime/154587");
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("fetchAnimeByAnilistId fetches data from animeApi.my.id/anilist/:id", async () => {
        const mockData = { title: "Frieren", myanimelist: 52991, anilist: 154587 };
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            if (url.toString() === `${ANIME_API_URL}/anilist/154587`) {
                return new Response(JSON.stringify(mockData), { status: 200 });
            }
            return new Response(null, { status: 404 });
        }) as unknown as typeof globalThis.fetch;

        try {
            const res = await fetchAnimeByAnilistId(154587);
            expect(res).toEqual(mockData);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("fetchAnimeByMalId fetches data from animeApi.my.id/myanimelist/:id", async () => {
        const mockData = { title: "Frieren", myanimelist: 52991, anilist: 154587 };
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            if (url.toString() === `${ANIME_API_URL}/myanimelist/52991`) {
                return new Response(JSON.stringify(mockData), { status: 200 });
            }
            return new Response(null, { status: 404 });
        }) as unknown as typeof globalThis.fetch;

        try {
            const res = await fetchAnimeByMalId(52991);
            expect(res).toEqual(mockData);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("fetchAnimeByAnidbId fetches data from animeApi.my.id/anidb/:id", async () => {
        const mockData = { title: "Frieren", myanimelist: 52991, anilist: 154587, anidb: 17617 };
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            if (url.toString() === `${ANIME_API_URL}/anidb/17617`) {
                return new Response(JSON.stringify(mockData), { status: 200 });
            }
            return new Response(null, { status: 404 });
        }) as unknown as typeof globalThis.fetch;

        try {
            const res = await fetchAnimeByAnidbId(17617);
            expect(res).toEqual(mockData);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    test("getRedirectUrl queries animeApi.my.id/redirect endpoint", async () => {
        const targetUrl = "https://myanimelist.net/anime/52991";
        const originalFetch = globalThis.fetch;
        globalThis.fetch = mock(async (url: string | URL | Request) => {
            if (url.toString().includes(`${ANIME_API_URL}/redirect?platform=anilist&mediaid=154587`)) {
                return new Response(targetUrl, { status: 200 });
            }
            return new Response(null, { status: 404 });
        }) as unknown as typeof globalThis.fetch;

        try {
            const res = await getRedirectUrl("anilist", 154587, "myanimelist");
            expect(res).toBe(targetUrl);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });
});
