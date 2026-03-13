import axios from "axios";
import * as cheerio from "cheerio";

export interface AnimeToshoImages {
    screenshots: string[];
    cover: string | null;
    directDownloads: { name: string; url: string }[];
}

/**
 * Fetches AnimeTosho screenshots and an Anilist cover image for a given torrent infohash.
 * @param infohash The BT infohash of the torrent
 * @returns An object containing an array of screenshot URLs and a cover URL (if found)
 */
export async function fetchAnimeImages(infohash: string): Promise<AnimeToshoImages> {
    const result: AnimeToshoImages = {
        screenshots: [],
        cover: null,
        directDownloads: []
    };

    try {
        // 1. Fetch AnimeTosho feed JSON to get file metadata and AniDB ID
        const toshoResponse = await axios.get(`https://feed.animetosho.org/json?show=torrent&btih=${infohash}`);
        const toshoData = toshoResponse.data;

        if (!toshoData || toshoData.error) {
            return result;
        }

        // 2. Extract cover using the AniDB ID mapping (if available)
        if (toshoData.anidb_aid) {
            result.cover = await fetchAnilistCover(toshoData.anidb_aid);
        }

        // 3. Extract screenshots and DDLs from the primary video file page
        if (toshoData.files && Array.isArray(toshoData.files)) {
            // Find a video file (mkv, mp4, avi, ts)
            const videoFile = toshoData.files.find((f: any) => {
                if (f.type === "video") return true;
                const ext = f.filename ? f.filename.toLowerCase().split(".").pop() : "";
                return ["mkv", "mp4", "avi", "ts"].includes(ext);
            });

            if (videoFile && videoFile.links) {
                for (const [provider, url] of Object.entries(videoFile.links)) {
                    if (typeof url === "string") {
                        result.directDownloads.push({ name: provider, url });
                    } else if (Array.isArray(url) && url.length > 0) {
                        result.directDownloads.push({ name: provider, url: String(url[0]) });
                    }
                }
            }

            // If no explicit video file, fallback to the primary_file_id
            const fileId = videoFile ? videoFile.id : toshoData.primary_file_id;

            if (fileId) {
                result.screenshots = await fetchToshoScreenshots(fileId);
            }
        }

        return result;
    } catch (error) {
        console.error(`[AnimeTosho] Error fetching images for ${infohash}:`, error);
        return result;
    }
}

async function fetchAnilistCover(anidbId: number | string): Promise<string | null> {
    try {
        // Get Anilist ID from the mapping API
        const mapResponse = await axios.get(`https://animeapi.my.id/anidb/${anidbId}`);
        const anilistId = mapResponse.data?.anilist;

        if (!anilistId) return null;

        // Query Anilist GraphQL for the Cover Image
        const query = `
      query($id: Int) {
        Media(id: $id, type: ANIME) {
          coverImage { extraLarge }
        }
      }
    `;

        const aniResponse = await axios.post(
            "https://graphql.anilist.co",
            {
                query,
                variables: { id: parseInt(anilistId.toString()) }
            },
            {
                headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json"
                }
            }
        );

        const coverUrl = aniResponse.data?.data?.Media?.coverImage?.extraLarge;
        return coverUrl || null;
    } catch (error) {
        console.error(`[Anilist Cover] Error fetching cover for AniDB ${anidbId}:`, error);
        return null;
    }
}

async function fetchToshoScreenshots(fileId: number | string): Promise<string[]> {
    try {
        const htmlResponse = await axios.get(`https://animetosho.org/file/${fileId}`);
        const html = htmlResponse.data;

        // Look for the "Screenshots" table row chunk to avoid parsing the whole document unnecessarily
        const match = html.match(/<th>Screenshots<\/th>.*?<td>(.*?)<\/td>/s);
        if (!match || !match[1]) return [];

        const screenshotsHtml = match[1];
        const $ = cheerio.load(screenshotsHtml);
        const screenshots: string[] = [];

        // Extract storage URLs from the img elements
        $("img").each((_, el) => {
            const src = $(el).attr("src") || $(el).attr("srcset");
            if (!src) return;

            if (src && src.includes("sframes")) {
                let fullSrc: string = String(src);

                // Clean up the URL to get the highest quality by stripping size parameters
                if (fullSrc.includes("?")) {
                    fullSrc = String(fullSrc.split("?")[0]);
                }

                // Ensure its an absolute storage URL
                if (fullSrc.startsWith("/")) {
                    fullSrc = "https://animetosho.org" + fullSrc;
                }

                screenshots.push(fullSrc);
            }
        });

        // We can also check the anchor tags for the original PNG links
        $("a.screenthumb").each((_, el) => {
            const href = $(el).attr("href");
            if (!href) return;

            if (href && href.includes("sframes")) {
                let fullHref: string = String(href);
                if (fullHref.includes("?")) {
                    fullHref = String(fullHref.split("?")[0]); // Remove ?s=4 etc
                }
                if (fullHref.startsWith("/")) {
                    fullHref = "https://animetosho.org" + fullHref;
                }
                screenshots.push(fullHref);
            }
        });

        // Deduplicate array
        return [...new Set(screenshots)];
    } catch (error) {
        console.error(`[AnimeTosho Screenshots] Error fetching HTML for file ${fileId}:`, error);
        return [];
    }
}
