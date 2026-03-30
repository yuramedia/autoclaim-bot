/**
 * Media Downloader Types
 * Type definitions for media downloading service
 */

/** Format information from downloader API */
export interface VKRFormat {
    url: string;
    format_id: string;
    ext: string;
    size: string;
}

/** Response from downloader API */
export interface VKRResponse {
    success?: boolean;
    title?: string;
    source?: string;
    thumbnail?: string;
    formats?: VKRFormat[];
    error?: string;
}

/** Result of a download attempt */
export interface DownloadResult {
    success: boolean;
    buffer?: Buffer;
    filename?: string;
    title?: string;
    thumbnail?: string;
    error?: string;
    fallbackUrl?: string;
    oversized?: boolean;
    availableFormats?: VKRFormat[];
}
