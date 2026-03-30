/**
 * Media Downloader Service
 * Downloads media from social platforms using VKrDownloader API
 */

import axios from "axios";
import type { VKRResponse, VKRFormat, DownloadResult } from "../types/media-downloader";
import { VKRDOWNLOADER_API, VKRDOWNLOADER_API_KEY, DEFAULT_MAX_DOWNLOAD_SIZE } from "../constants/media-downloader";

// Re-export types for backwards compatibility
export type { VKRResponse, VKRFormat, DownloadResult };

// Parse size string like "10 MB", "5.2 MB" to bytes
function parseSizeToBytes(sizeStr: string): number {
    if (!sizeStr) return Infinity;
    const match = sizeStr.match(/([\d.]+)\s*(KB|MB|GB)/i);
    if (!match || !match[1] || !match[2]) return Infinity;

    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();

    switch (unit) {
        case "KB":
            return value * 1024;
        case "MB":
            return value * 1024 * 1024;
        case "GB":
            return value * 1024 * 1024 * 1024;
        default:
            return Infinity;
    }
}

/**
 * Fetch media info from VKrDownloader API
 */
export async function fetchMediaInfo(videoUrl: string): Promise<VKRResponse | null> {
    try {
        const response = await axios.get<VKRResponse>(VKRDOWNLOADER_API, {
            params: {
                api_key: VKRDOWNLOADER_API_KEY,
                vkr: videoUrl
            },
            timeout: 15000
        });

        return response.data;
    } catch (error) {
        console.error("VKrDownloader API error:", error);
        return null;
    }
}

/**
 * Download media if it's under the size limit, or return available formats if oversized
 */
export async function downloadMedia(
    videoUrl: string,
    maxSizeLimit: number = DEFAULT_MAX_DOWNLOAD_SIZE
): Promise<DownloadResult> {
    try {
        // Fetch media info
        const info = await fetchMediaInfo(videoUrl);

        if (!info) {
            return { success: false, error: "Failed to fetch media info" };
        }

        // If no formats available, try source directly
        if (!info.formats || info.formats.length === 0) {
            if (info.source) {
                // Try to download from source
                try {
                    const response = await axios.get(info.source, {
                        responseType: "arraybuffer",
                        timeout: 30000,
                        maxContentLength: maxSizeLimit,
                        headers: {
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                        }
                    });

                    const buffer = Buffer.from(response.data);
                    if (buffer.length <= maxSizeLimit) {
                        return {
                            success: true,
                            buffer,
                            filename: `video_${Date.now()}.mp4`,
                            title: info.title,
                            thumbnail: info.thumbnail
                        };
                    }
                } catch {
                    // Fallthrough to error
                }
            }
            return {
                success: false,
                error: "No suitable format found or file too large",
                title: info.title,
                thumbnail: info.thumbnail,
                fallbackUrl: info.source
            };
        }

        // Sort formats by size descending (prefer higher quality)
        const sortedFormats = info.formats.toSorted((a, b) => parseSizeToBytes(b.size) - parseSizeToBytes(a.size));
        const validFormats = sortedFormats.filter(f => parseSizeToBytes(f.size) <= maxSizeLimit);

        // Try downloading the best valid format automatically
        if (validFormats.length > 0) {
            try {
                const firstValid = validFormats[0]!;
                const response = await axios.get(firstValid.url, {
                    responseType: "arraybuffer",
                    timeout: 60000,
                    maxContentLength: maxSizeLimit,
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
                    }
                });

                const buffer = Buffer.from(response.data);

                if (buffer.length <= maxSizeLimit) {
                    const ext = firstValid.ext || "mp4";
                    const filename = `${(info.title || "video").slice(0, 50).replace(/[^\w\s-]/g, "")}_${Date.now()}.${ext}`;

                    return {
                        success: true,
                        buffer,
                        filename,
                        title: info.title,
                        thumbnail: info.thumbnail
                    };
                }
            } catch {
                // If download fails (e.g. maxContentLength exceeded), we fall through to the select menu
            }
        }

        if (sortedFormats.length === 0) {
            return { success: false, error: "No formats available" };
        }

        // If we reach here, best automatic format didn't fit or no formats ostensibly fit.
        // Ask the user to manually select a resolution.
        return {
            success: false,
            error: "Automatically selected video exceeded server limit. Please select a lower resolution.",
            oversized: true,
            availableFormats: sortedFormats, // Show all so they can try lower ones
            title: info.title
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Download failed"
        };
    }
}

/**
 * Download a direct media URL (bypasses VKrDownloader)
 * @param url Direct media URL (e.g. mp4 link)
 * @param defaultFilename Fallback filename
 * @param maxSizeLimit The maximum size allowed
 */
export async function downloadDirect(
    url: string,
    defaultFilename: string = "video.mp4",
    maxSizeLimit: number = DEFAULT_MAX_DOWNLOAD_SIZE
): Promise<DownloadResult> {
    try {
        const response = await axios.get(url, {
            responseType: "arraybuffer",
            timeout: 60000,
            maxContentLength: maxSizeLimit,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });

        const buffer = Buffer.from(response.data);
        if (buffer.length > maxSizeLimit) {
            return { success: false, error: "File too large for this server's boost level" };
        }

        return {
            success: true,
            buffer,
            filename: defaultFilename
        };
    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Direct download failed or exceeded size limit"
        };
    }
}
