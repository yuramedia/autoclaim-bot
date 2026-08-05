import { describe, expect, test } from "bun:test";
import { parseCrunchyrollUrl } from "./subcr";

describe("subcr parseCrunchyrollUrl", () => {
    test("parses direct episode ID", () => {
        const result = parseCrunchyrollUrl("GE00377807JAJP");
        expect(result).toEqual({ type: "episode", id: "GE00377807JAJP" });
    });

    test("parses standard episode URL", () => {
        const result = parseCrunchyrollUrl("https://www.crunchyroll.com/watch/GE00377807JAJP/battle-with-oneself");
        expect(result).toEqual({ type: "episode", id: "GE00377807JAJP" });
    });

    test("parses localized episode URL (e.g. /id/watch/...)", () => {
        const result = parseCrunchyrollUrl("https://www.crunchyroll.com/id/watch/GE00377807JAJP/battle-with-oneself");
        expect(result).toEqual({ type: "episode", id: "GE00377807JAJP" });
    });

    test("parses localized series URL (e.g. /id/series/...)", () => {
        const result = parseCrunchyrollUrl("https://www.crunchyroll.com/id/series/GT00365589/some-anime");
        expect(result).toEqual({ type: "series", id: "GT00365589" });
    });

    test("returns null for invalid URLs", () => {
        const result = parseCrunchyrollUrl("https://example.com/invalid");
        expect(result).toBeNull();
    });
});
