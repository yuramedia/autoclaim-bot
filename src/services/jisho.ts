import axios from "axios";
import { JISHO_API_URL, JISHO_BASE_URL, JISHO_USER_AGENT } from "../constants/jisho";
import type { JishoAPIResponse, JishoResult, JishoWord } from "../types/jisho";

export class JishoService {
    /**
     * Search for a keyword on Jisho.org
     * @param keyword The word or kanji to search for
     * @returns Array of parsed JishoWord objects
     */
    static async search(keyword: string): Promise<JishoWord[]> {
        try {
            const response = await axios.get<JishoAPIResponse>(JISHO_API_URL, {
                params: {
                    keyword
                },
                headers: {
                    "User-Agent": JISHO_USER_AGENT
                }
            });

            if (response.status !== 200) {
                console.error(`Jisho API returned status code ${response.status}`);
                return [];
            }

            const results = response.data.data;
            return results.map(result => this.parseResult(result));
        } catch (error) {
            console.error("Error fetching data from Jisho:", error);
            return [];
        }
    }

    /**
     * Parse a raw Jisho API result into a cleaner JishoWord object
     * @param result Raw API result
     * @returns Parsed JishoWord
     */
    private static parseResult(result: JishoResult): JishoWord {
        const { slug, is_common, tags, jlpt, japanese, senses } = result;

        // Extract word and reading
        // Usually the first entry in 'japanese' is the primary one
        const primaryJapanese = japanese[0] || {};
        const word = primaryJapanese.word || primaryJapanese.reading || slug;
        const reading = primaryJapanese.reading;

        // Parse meanings
        const parsedMeanings = senses.map(sense => ({
            parts: sense.parts_of_speech,
            definitions: sense.english_definitions,
            tags: sense.tags,
            info: sense.info,
            seeAlso: sense.see_also
        }));

        // Parse other forms
        // All entries in 'japanese' array are valid forms
        const otherForms = japanese.map(jp => ({
            word: jp.word || jp.reading || "",
            reading: jp.reading
        }));

        return {
            slug,
            word,
            reading,
            meanings: parsedMeanings,
            otherForms,
            isCommon: is_common || false,
            jlpt: jlpt || [],
            tags: tags || [],
            url: `${JISHO_BASE_URL}/word/${slug}`
        };
    }
}
