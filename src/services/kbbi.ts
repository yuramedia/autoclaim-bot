import axios from "axios";
import * as cheerio from "cheerio";
import type { KbbiResult } from "../types/kbbi";
import { KBBI_BASE_URL, KBBI_USER_AGENT } from "../constants/kbbi";

const extractDefinitions = ($: cheerio.CheerioAPI, selector: string): string[] => {
    const definitions: string[] = [];
    $(selector).each((_, el) => {
        const $el = $(el);
        let label = "";
        let example = "";

        // Capture labels from red font tags
        const redFonts = $el.find("font[color='red']");
        if (redFonts.length > 0) {
            label = redFonts
                .map((_, f) => $(f).text().trim())
                .get()
                .filter(t => t.length > 0)
                .join(" ");
        }

        // Also check for span with class 'kelas'
        const spanTags = $el.find("span.kelas");
        if (spanTags.length > 0) {
            const spanLabel = spanTags
                .map((_, s) => $(s).text().trim())
                .get()
                .filter(t => t.length > 0)
                .join(" ");
            label = label ? `${label} ${spanLabel}` : spanLabel;
        }

        // Capture examples from grey font tags
        const greyFonts = $el.find("font[color='grey']");
        if (greyFonts.length > 0) {
            example = greyFonts
                .map((_, f) => $(f).text().trim())
                .get()
                .filter(t => t.length > 0)
                .join(" "); // Sometimes there are multiple parts?
        }

        // Remove ALL font tags (including grey examples) and span.kelas
        $el.find("font").remove();
        $el.find("span.kelas").remove();

        // Check for links (<a> tags) and convert to markdown
        // e.g. <a href="../../entri/bagaimana">bagaimana</a> -> [bagaimana](https://kbbi.kemendikdasmen.go.id/entri/bagaimana)
        $el.find("a").each((_, a) => {
            const $a = $(a);
            const href = $a.attr("href");
            const text = $a.text().trim();
            if (href && text) {
                // Construct full URL. HREFs are like "../../entri/bagaimana"
                // We want to be careful with paths.
                let fullUrl = href;
                if (!href.startsWith("http")) {
                    // Normalize path. If it starts with "../../", replace it or just append to base?
                    // KBBI_BASE_URL is "https://kbbi.kemendikdasmen.go.id/entri/"
                    // href might be "../../entri/bagaimana" which resolves to "https://kbbi.../entri/bagaimana"
                    // Or "bagaimana" (relative).
                    // Simplest: extract the word after "entri/" if present, or just use the word text?
                    const match = href.match(/entri\/(.+)$/);
                    if (match) {
                        fullUrl = `${KBBI_BASE_URL}${match[1]}`;
                    } else {
                        // Fallback?
                        fullUrl = `${KBBI_BASE_URL}${text}`;
                    }
                }
                $a.replaceWith(`[${text}](${fullUrl})`);
            }
        });

        const defText = $el.text().trim();
        if (defText) {
            let fullDef = defText;

            if (label) {
                fullDef = `*${label}* ${fullDef}`;
            }

            if (example) {
                fullDef = `${fullDef}\n> ${example}`;
            }

            definitions.push(fullDef);
        }
    });
    return definitions;
};

const searchThesaurus = async (url: string): Promise<string[]> => {
    try {
        const response = await axios.get(url, {
            headers: { "User-Agent": KBBI_USER_AGENT }
        });
        const $ = cheerio.load(response.data);
        const synonyms: string[] = [];

        $(".one-par-content a.lemma-ordinary").each((_, el) => {
            synonyms.push($(el).text().trim());
        });

        return [...new Set(synonyms)]; // Unique
    } catch (error) {
        console.error(`Error fetching Thesaurus from ${url}:`, error);
        return [];
    }
};

export const searchKbbi = async (word: string): Promise<KbbiResult | null> => {
    try {
        const url = `${KBBI_BASE_URL}${encodeURIComponent(word)}`;
        const response = await axios.get(url, {
            headers: {
                "User-Agent": KBBI_USER_AGENT
            }
        });

        const $ = cheerio.load(response.data);
        const $h2 = $("h2").first();

        // Remove 'sup' tags (like footnotes) which might interfere
        $h2.find("sup").remove();

        let lemma = $h2.clone().children().remove().end().text().trim();
        const otherDetails: string[] = [];

        // Check for small tags inside h2 (e.g., "bentuk tidak baku: ...")
        $h2.find("small").each((_, el) => {
            otherDetails.push($(el).text().trim());
        });

        // If lemma is empty (maybe structure is different), fallback to full text but try to exclude small
        if (!lemma) {
            const fullText = $h2.text().trim();
            // If we have extracted other details, remove them from fullText?
            // It's safer to just take everything if the split failed, but let's try:
            lemma = fullText;
            // Remove known other details from lemma string if possible?
            for (const detail of otherDetails) {
                lemma = lemma.replace(detail, "").trim();
            }
        }

        if (!lemma) {
            return null;
        }

        // Check for Thesaurus link
        let thesaurusUrl = "";
        $("p a").each((_, el) => {
            const text = $(el).text();
            if (text.includes("Tesaurus")) {
                const href = $(el).attr("href");
                if (href) {
                    thesaurusUrl = href;
                }
            }
        });

        let synonyms: string[] = [];
        if (thesaurusUrl) {
            synonyms = await searchThesaurus(thesaurusUrl);
        }

        const definitions: string[] = [];

        definitions.push(...extractDefinitions($, "ol li"));
        definitions.push(...extractDefinitions($, "ul.adjusted-par li"));

        const cleanedDefinitions = definitions.filter(d => d.length > 0);

        return {
            lemma,
            otherDetails,
            synonyms: synonyms.length > 0 ? synonyms : undefined,
            definitions: cleanedDefinitions
        };
    } catch (error) {
        console.error(`Error fetching KBBI for ${word}:`, error);
        return null;
    }
};
