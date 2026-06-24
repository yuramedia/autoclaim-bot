import { logger } from "../core/logger";

/**
 * Language code to display name mapping.
 * Seeded with known clean overrides; updated at runtime by fetchCrunchyrollLanguages().
 */
export const LANG_MAP: Record<string, string> = {
    "en-US": "English",
    "ja-JP": "Japanese",
    "id-ID": "Indonesian",
    "ms-MY": "Malay",
    "ca-ES": "Catalan",
    "de-DE": "German",
    "es-LA": "Spanish (LA)",
    "es-ES": "Spanish (ES)",
    "es-419": "Spanish (LA)",
    "fr-FR": "French",
    "it-IT": "Italian",
    "pl-PL": "Polish",
    "pt-BR": "Portuguese (BR)",
    "pt-PT": "Portuguese",
    "vi-VN": "Vietnamese",
    "tr-TR": "Turkish",
    "ru-RU": "Russian",
    "ar-SA": "Arabic",
    "hi-IN": "Hindi",
    "ta-IN": "Tamil",
    "te-IN": "Telugu",
    "zh-HK": "Cantonese",
    "zh-CN": "Mandarin",
    "zh-TW": "Mandarin (TW)",
    "ko-KR": "Korean",
    "th-TH": "Thai",
    "en-IN": "English (India)"
};

/**
 * Fetches Crunchyroll timed text and audio languages from remote configurations
 * and updates LANG_MAP in place.
 *
 * LANG_MAP entries act as clean-name overrides so they always win over the
 * raw values returned by the Crunchyroll config endpoints.
 */
export async function fetchCrunchyrollLanguages(): Promise<void> {
    try {
        const timedTextUrl = "https://static.crunchyroll.com/config/i18n/v3/timed_text_languages.json";
        const audioUrl = "https://static.crunchyroll.com/config/i18n/v3/audio_languages.json";

        const [timedTextRes, audioRes] = (await Promise.all([
            fetch(timedTextUrl).then(res => (res.ok ? res.json() : null)),
            fetch(audioUrl).then(res => (res.ok ? res.json() : null))
        ])) as [unknown, unknown];

        const merged: Record<string, string> = {};

        if (timedTextRes && typeof timedTextRes === "object") {
            for (const [code, name] of Object.entries(timedTextRes)) {
                if (typeof name === "string") merged[code] = name;
            }
        }

        if (audioRes && typeof audioRes === "object") {
            for (const [code, name] of Object.entries(audioRes)) {
                if (typeof name === "string") merged[code] = name;
            }
        }

        // Snapshot current overrides before mutating
        const overrides = { ...LANG_MAP };

        // Combine: fallback defaults first, remote data takes precedence (matches the links)
        const newMap = { ...overrides, ...merged };

        // Mutate in place so existing references to LANG_MAP stay valid
        for (const key of Object.keys(LANG_MAP)) delete LANG_MAP[key];
        Object.assign(LANG_MAP, newMap);
    } catch (error) {
        logger.error(error, "Failed to fetch Crunchyroll languages, using defaults");
    }
}
