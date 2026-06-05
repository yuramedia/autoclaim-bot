/**
 * Represents a search result entry from the KBBI (Kamus Besar Bahasa Indonesia).
 */
export interface KbbiResult {
    /** The main headword (lemma). */
    lemma: string;
    /** Additional grammatical or contextual details. */
    otherDetails: string[];
    /** Synonyms grouped by word class. */
    synonyms?: {
        /** The word class/category. */
        class: string;
        /** List of synonym words. */
        words: string[];
    }[];
    /** Reference URL to the thesaurus entry. */
    thesaurusUrl?: string;
    /** Definitions of the headword. */
    definitions: string[];
}
