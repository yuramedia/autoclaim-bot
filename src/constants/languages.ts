/**
 * Language code to display name mapping
 * Used by Crunchyroll feed and other services
 */
export const LANG_MAP: Record<string, string> = {
    "en-US": "English",
    "ja-JP": "Japanese",
    "id-ID": "Indonesian",
    "ms-MY": "Malay",
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
    "th-TH": "Thai"
};

/**
 * Fetches Crunchyroll timed text and audio languages from remote configurations
 * and updates LANG_MAP in place.
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

        // Merge timed text languages
        if (timedTextRes && typeof timedTextRes === "object") {
            Object.entries(timedTextRes).forEach(([code, name]) => {
                if (typeof name === "string") {
                    merged[code] = name;
                }
            });
        }

        // Merge audio languages
        if (audioRes && typeof audioRes === "object") {
            Object.entries(audioRes).forEach(([code, name]) => {
                if (typeof name === "string") {
                    merged[code] = name;
                }
            });
        }

        // Update LANG_MAP in place, prioritizing our clean overrides
        // and keeping ja-JP which is missing from Crunchyroll configs.
        const cleanOverrides: Record<string, string> = {
            "en-US": "English",
            "ja-JP": "Japanese",
            "id-ID": "Indonesian",
            "ms-MY": "Malay",
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
            "th-TH": "Thai"
        };

        // Combine: merged languages fallback, overrides take precedence
        const newMap = { ...merged, ...cleanOverrides };

        // Mutate the original LANG_MAP so references are kept
        Object.keys(LANG_MAP).forEach(key => {
            delete LANG_MAP[key];
        });
        Object.assign(LANG_MAP, newMap);
    } catch (error) {
        console.error("Failed to fetch Crunchyroll languages, using defaults:", error);
    }
}
