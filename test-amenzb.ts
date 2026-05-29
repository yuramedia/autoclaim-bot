import axios from "axios";
import * as cheerio from "cheerio";

const AMENZB_BASE_URL = "https://amenzb.moe";
const AMENZB_API_PATH = "/api";
const AMENZB_API_KEY = "f94acca72e85157f70a10f50db05af41";

function extractReleaseId(xml: string): string | null {
    // Try to get guid from <newznab:attr name="guid" value="..."/>
    const guidAttrMatch = xml.match(/<newznab:attr\s+name="guid"\s+value="(\d+)"\s*\/>/);
    if (guidAttrMatch?.[1]) {
        return guidAttrMatch[1];
    }

    // Fallback: extract ID from <guid> URL
    const guidMatch = xml.match(/<guid[^>]*>https?:\/\/[^/]+\/(?:download|release)\/(\d+)<\/guid>/);
    if (guidMatch?.[1]) {
        return guidMatch[1];
    }

    // Fallback: extract from <link>
    const linkMatch = xml.match(/<link>https?:\/\/[^/]+\/(?:download|release)\/(\d+)<\/link>/);
    if (linkMatch?.[1]) {
        return linkMatch[1];
    }

    return null;
}

function extractScreenshots(html: string, _releaseId: string): string[] {
    const screenshots: string[] = [];
    const $ = cheerio.load(html);

    // Method 1: Parse data-full attributes from ss-thumb images (preferred — full-size)
    $(".ss-thumb, img[data-full]").each((_, el) => {
        const fullSrc = $(el).attr("data-full");
        if (fullSrc) {
            const absoluteUrl = fullSrc.startsWith("/") ? `${AMENZB_BASE_URL}${fullSrc}` : fullSrc;
            screenshots.push(absoluteUrl);
        }
    });

    // Method 2: Parse data-src attributes (thumbnail fallback)
    if (screenshots.length === 0) {
        $(".ss-thumb, img[data-src]").each((_, el) => {
            const dataSrc = $(el).attr("data-src");
            if (dataSrc && dataSrc.includes("screenshots")) {
                const absoluteUrl = dataSrc.startsWith("/") ? `${AMENZB_BASE_URL}${dataSrc}` : dataSrc;
                screenshots.push(absoluteUrl);
            }
        });
    }

    // Method 3: Parse src attributes from images inside screenshotBody
    if (screenshots.length === 0) {
        $("#screenshotBody img").each((_, el) => {
            const src = $(el).attr("src");
            if (src && src.includes("screenshots")) {
                const absoluteUrl = src.startsWith("/") ? `${AMENZB_BASE_URL}${src}` : src;
                screenshots.push(absoluteUrl);
            }
        });
    }

    // Method 4: Regex fallback for screenshot URLs in raw HTML
    if (screenshots.length === 0) {
        const screenshotRegex = /(?:data-full|data-src|src)="([^"]*\/static\/screenshots\/[^"]+\.webp)"/g;
        let match;
        while ((match = screenshotRegex.exec(html)) !== null) {
            const url = match[1];
            if (url) {
                const absoluteUrl = url.startsWith("/") ? `${AMENZB_BASE_URL}${url}` : url;
                if (!screenshots.includes(absoluteUrl)) {
                    screenshots.push(absoluteUrl);
                }
            }
        }
    }

    return [...new Set(screenshots)];
}

async function main() {
    const infohash = "2ac7629a7dc41aa57a3c7ae581dc4a7106ac0cbb";
    console.log(`Searching for infohash ${infohash}...`);

    try {
        const searchUrl = `${AMENZB_BASE_URL}${AMENZB_API_PATH}?t=search&apikey=${AMENZB_API_KEY}&info_hash=${infohash.toLowerCase()}`;
        console.log("URL:", searchUrl);
        const res = await axios.get(searchUrl, { timeout: 15000 });
        const xml = res.data;

        const releaseId = extractReleaseId(xml);
        console.log(`Extracted release ID: ${releaseId}`);
        if (!releaseId) return;

        const releaseUrl = `${AMENZB_BASE_URL}/release/${releaseId}`;
        const resHtml = await axios.get(releaseUrl, { timeout: 15000 });
        const html = resHtml.data;
        const screenshots = extractScreenshots(html, releaseId);
        console.log(`Found ${screenshots.length} screenshots:`, screenshots);
    } catch (e) {
        console.error("Error fetching:", e instanceof Error ? e.message : String(e));
    }
}

main().catch(console.error);
