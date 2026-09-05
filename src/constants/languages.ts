import { logger } from "../core/logger";
import { fetchWithTimeout } from "../utils/http";

/**
 * Standard ECMAScript Internationalization API (Intl) DisplayNames instance.
 * Automatically resolves any BCP 47 locale code to an English language name.
 */
export const languageDisplayNames = new Intl.DisplayNames(["en"], { type: "language" });

/**
 * Common Crunchyroll language codes.
 * Used as initial baseline before remote configuration is fetched.
 */
const DEFAULT_CRUNCHYROLL_CODES = [
    "en-US",
    "ja-JP",
    "id-ID",
    "ms-MY",
    "ca-ES",
    "de-DE",
    "es-419",
    "es-ES",
    "fr-FR",
    "it-IT",
    "pl-PL",
    "pt-BR",
    "pt-PT",
    "vi-VN",
    "tr-TR",
    "ru-RU",
    "ar-SA",
    "hi-IN",
    "ta-IN",
    "te-IN",
    "zh-HK",
    "zh-CN",
    "zh-TW",
    "ko-KR",
    "th-TH",
    "en-IN"
] as const;

/**
 * Internal storage for Crunchyroll languages.
 * Seeded with default codes whose names are 100% auto-detected via Intl.DisplayNames.
 */
const dynamicLangMap: Record<string, string> = Object.fromEntries(
    DEFAULT_CRUNCHYROLL_CODES.map(code => [code, languageDisplayNames.of(code) || code])
);

/** Legacy / non-standard Crunchyroll code alias overrides */
dynamicLangMap["es-LA"] = "Spanish (Latin America)";

/**
 * Resolves any BCP 47 language/locale code to a human-readable display name.
 * Automatically detects names via Intl.DisplayNames, with dynamic cache fallback.
 *
 * @param code - BCP 47 locale code (e.g. "en-US", "id-ID", "uk-UA")
 * @returns Human readable language name or original code if unrecognized
 */
export function getLanguageDisplayName(code: string): string {
    if (!code) return "";
    if (dynamicLangMap[code]) return dynamicLangMap[code];

    try {
        const name = languageDisplayNames.of(code);
        if (name && name.toLowerCase() !== code.toLowerCase()) {
            return name;
        }
    } catch {
        // Fallback for underscore formats like "id_ID"
        try {
            const normalized = code.replace("_", "-");
            const name = languageDisplayNames.of(normalized);
            if (name) return name;
        } catch {
            // Ignore
        }
    }

    return code;
}

/**
 * Language code to display name mapping.
 * Dynamically auto-detects unlisted BCP-47 locale codes via Intl.DisplayNames.
 */
export const LANG_MAP: Record<string, string> = new Proxy(dynamicLangMap, {
    get(target, prop, receiver) {
        if (typeof prop === "string" && !(prop in target)) {
            const autoDetected = getLanguageDisplayName(prop);
            if (autoDetected && autoDetected !== prop) {
                return autoDetected;
            }
        }
        return Reflect.get(target, prop, receiver);
    }
});

/**
 * Fetches Crunchyroll timed text and audio languages from remote configurations
 * and updates LANG_MAP in place.
 */
export async function fetchCrunchyrollLanguages(): Promise<void> {
    try {
        const timedTextUrl = "https://static.crunchyroll.com/config/i18n/v3/timed_text_languages.json";
        const audioUrl = "https://static.crunchyroll.com/config/i18n/v3/audio_languages.json";

        const [timedTextRes, audioRes] = (await Promise.all([
            fetchWithTimeout(timedTextUrl, { timeoutMs: 8000 })
                .then(res => (res.ok ? res.json() : null))
                .catch(() => null),
            fetchWithTimeout(audioUrl, { timeoutMs: 8000 })
                .then(res => (res.ok ? res.json() : null))
                .catch(() => null)
        ])) as [unknown, unknown];

        const merged: Record<string, string> = {};

        if (timedTextRes && typeof timedTextRes === "object") {
            for (const [code, name] of Object.entries(timedTextRes)) {
                if (typeof name === "string") {
                    merged[code] = getLanguageDisplayName(code) || name;
                }
            }
        }

        if (audioRes && typeof audioRes === "object") {
            for (const [code, name] of Object.entries(audioRes)) {
                if (typeof name === "string") {
                    merged[code] = getLanguageDisplayName(code) || name;
                }
            }
        }

        // Snapshot current entries
        const current = { ...dynamicLangMap };
        const newMap = { ...current, ...merged };

        // Mutate in place so existing references to LANG_MAP stay valid
        for (const key of Object.keys(dynamicLangMap)) delete dynamicLangMap[key];
        Object.assign(dynamicLangMap, newMap);
    } catch (error) {
        logger.error(error, "Failed to fetch Crunchyroll languages, using defaults");
    }
}
