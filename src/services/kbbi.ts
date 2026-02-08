import axios from "axios";
import * as cheerio from "cheerio";

export interface KbbiResult {
    lemma: string;
    definitions: string[];
    tesaurusLink?: string;
}

export const searchKbbi = async (word: string): Promise<KbbiResult | null> => {
    try {
        const url = `https://kbbi.kemendikdasmen.go.id/entri/${encodeURIComponent(word)}`;
        const response = await axios.get(url, {
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
            }
        });

        const $ = cheerio.load(response.data);
        const lemma = $("h2").first().text().trim();

        if (!lemma) {
            return null;
        }

        const definitions: string[] = [];

        // Get definitions from ol > li
        $("ol li").each((_, el) => {
            // Remove font tags (usually red classification codes like 'v', 'n') to clean up
            $(el).find("font").remove();
            definitions.push($(el).text().trim());
        });

        // Get definitions from ul.adjusted-par > li (sometimes used for single definitions or specific layouts)
        $("ul.adjusted-par li").each((_, el) => {
            $(el).find("font").remove();
            definitions.push($(el).text().trim());
        });

        // If no definitions found yet, try checking if there are direct paragraphs under h2's container or similar structure
        // But following the PHP repo:
        // $olElement = $xpath->query("following-sibling::ol[1]", $h2Element)->item(0);
        // $ulElement = $xpath->query("following-sibling::ul[@class='adjusted-par'][1]", $h2Element)->item(0);

        // Check for Tesaurus link
        // $tesaurusAnchor = $xpath->query("following-sibling::p[1]/a[contains(@href, 'tematis/lema')]", $h2Element)->item(0);
        let tesaurusLink: string | undefined;

        // Find the 'h2' and look for siblings
        const h2 = $("h2").first();
        const nextP = h2.nextAll("p").first();
        const tesaurusAnchor = nextP.find("a[href*='tematis/lema']");

        if (tesaurusAnchor.length > 0) {
            tesaurusLink = tesaurusAnchor.attr("href");
        } else {
            // Fallback from PHP repo: "http://tesaurus.kemendikdasmen.go.id/tematis/lema/" . $lema;
            // But we might verify if it actually exists or just let user click
            // The PHP repo logic adds it if not found, but let's stick to what we find for now or add generic if requested.
            // The PHP repo implementation:
            // } else { $tesaurusLink = "http://tesaurus.kemendikdasmen.go.id/tematis/lema/" . $lema; }
            // We can check if status 200 later, but for now let's optionalize it.
            tesaurusLink = `http://tesaurus.kemendikdasmen.go.id/tematis/lema/${encodeURIComponent(word)}`;
        }

        // Clean definitions of empty strings
        const cleanedDefinitions = definitions.filter(d => d.length > 0);

        if (cleanedDefinitions.length === 0) {
            // Sometimes the definition is just in a p tag if it's not a list?
            // The KBBI site usually uses OL/UL.
            // Let's verify with a real check if possible, but this covers 99% cases.
        }

        return {
            lemma,
            definitions: cleanedDefinitions,
            tesaurusLink
        };
    } catch (error) {
        console.error(`Error fetching KBBI for ${word}:`, error);
        return null;
    }
};
