/**
 * Represents Japanese writing and reading forms.
 */
export interface JishoJapanese {
    /** The word in kanji/kana representation, if available. */
    word?: string;
    /** The reading of the word in kana. */
    reading?: string;
}

/**
 * Represents a dictionary meaning sense from Jisho.
 */
export interface JishoSense {
    /** List of English definitions. */
    english_definitions: string[];
    /** Grammatical parts of speech. */
    parts_of_speech: string[];
    /** Reference links related to the sense. */
    links: {
        /** Label text for the link. */
        text: string;
        /** URL of the link. */
        url: string;
    }[];
    /** Tags associated with the sense. */
    tags: string[];
    /** Restrictions on usage. */
    restrictions: string[];
    /** References to other related entries. */
    see_also: string[];
    /** Antonyms of the word in this sense. */
    antonyms: string[];
    /** Source databases. */
    source: string[];
    /** Additional informational notes. */
    info: string[];
}

/**
 * Attribution information for the dictionary entry.
 */
export interface JishoAttribution {
    /** Whether the entry comes from JMdict. */
    jmdict: boolean;
    /** Whether the entry comes from JMnedict. */
    jmnedict: boolean;
    /** DBpedia resource link or boolean indicating availability. */
    dbpedia: boolean | string;
}

/**
 * Represents a single search result item from the Jisho API.
 */
export interface JishoResult {
    /** Unique slug identification of the word. */
    slug: string;
    /** Indicates if the word is commonly used. */
    is_common?: boolean;
    /** Tags associated with the result. */
    tags: string[];
    /** JLPT levels associated with the word. */
    jlpt: string[];
    /** Japanese writing and reading representations. */
    japanese: JishoJapanese[];
    /** Different senses/meanings of the word. */
    senses: JishoSense[];
    /** Source attributions. */
    attribution: JishoAttribution;
}

/**
 * Response structure returned by Jisho API.
 */
export interface JishoAPIResponse {
    /** Metadata of the response. */
    meta: {
        /** HTTP status code. */
        status: number;
    };
    /** Array of search results. */
    data: JishoResult[];
}

/**
 * Structured word information used within the application.
 */
export interface JishoWord {
    /** Unique slug identification. */
    slug: string;
    /** Main word representation. */
    word: string;
    /** Reading of the word in kana. */
    reading?: string;
    /** Structured meanings/senses. */
    meanings: {
        /** Parts of speech. */
        parts: string[];
        /** Definitions. */
        definitions: string[];
        /** Associated tags. */
        tags: string[];
        /** Informational notes. */
        info: string[];
        /** Cross references to other words. */
        seeAlso: string[];
    }[];
    /** Other writing/reading forms of the word. */
    otherForms: {
        /** Word representation. */
        word: string;
        /** Reading form. */
        reading?: string;
    }[];
    /** Indicates if it is a common word. */
    isCommon: boolean;
    /** JLPT levels. */
    jlpt: string[];
    /** Tags. */
    tags: string[];
    /** Reference URL to Jisho.org page. */
    url: string;
}
