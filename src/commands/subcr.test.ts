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

describe("subcr langNameToCode", () => {
    test("resolves direct locale codes", async () => {
        const { langNameToCode } = await import("./subcr");
        expect(langNameToCode("id-ID")).toBe("id-ID");
        expect(langNameToCode("en-US")).toBe("en-US");
        expect(langNameToCode("ms-MY")).toBe("ms-MY");
    });

    test("resolves aliases case-insensitively", async () => {
        const { langNameToCode } = await import("./subcr");
        expect(langNameToCode("indonesia")).toBe("id-ID");
        expect(langNameToCode("Indonesian")).toBe("id-ID");
        expect(langNameToCode("English")).toBe("en-US");
        expect(langNameToCode("melayu")).toBe("ms-MY");
        expect(langNameToCode("spanish")).toBe("es-419");
    });

    test("resolves language names from LANG_MAP values", async () => {
        const { langNameToCode } = await import("./subcr");
        expect(langNameToCode("Bahasa Indonesia")).toBe("id-ID");
        expect(langNameToCode("Bahasa Melayu")).toBe("ms-MY");
    });

    test("resolves prefix and ISO language codes via Intl.Locale", async () => {
        const { langNameToCode } = await import("./subcr");
        expect(langNameToCode("id")).toBe("id-ID");
        expect(langNameToCode("en")).toBe("en-US");
        expect(langNameToCode("ms")).toBe("ms-MY");
        expect(langNameToCode("de")).toBe("de-DE");
        expect(langNameToCode("ja")).toBe("ja-JP");
        expect(langNameToCode("fr")).toBe("fr-FR");
    });

    test("LANG_MAP dynamically resolves unlisted BCP-47 codes via Intl.DisplayNames", async () => {
        const { LANG_MAP, getLanguageDisplayName } = await import("../constants/languages");
        expect(LANG_MAP["uk-UA"]).toContain("Ukrainian");
        expect(LANG_MAP["ro-RO"]).toContain("Romanian");
        expect(getLanguageDisplayName("uk-UA")).toContain("Ukrainian");
        expect(getLanguageDisplayName("nonexistent_tag_123")).toBe("nonexistent_tag_123");
    });

    test("returns null for invalid or unknown language", async () => {
        const { langNameToCode } = await import("./subcr");
        expect(langNameToCode("nonexistent_language_xyz")).toBeNull();
    });
});

describe("subcr fetchAvailableSubtitleLangs", () => {
    test("returns empty array if no input is provided", async () => {
        const { fetchAvailableSubtitleLangs } = await import("./subcr");
        const langs = await fetchAvailableSubtitleLangs(null, null);
        expect(langs).toEqual([]);
    });
});
