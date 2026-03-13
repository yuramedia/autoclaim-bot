/**
 * Embed Fix Service
 * Detects social media URLs and provides fixed embed versions
 */

import { PlatformId, type PlatformConfig, type ProcessedUrl } from "../types/embed-fix";
import { PLATFORMS } from "../constants/embed-fix";

// Re-export types for backwards compatibility (if needed)
export { PlatformId };
export type { PlatformConfig, ProcessedUrl };

/**
 * Extract URLs from message content
 * @param content - Message content
 * @returns Array of extracted URLs with spoiler status
 */
export function extractUrls(content: string): { url: string; spoilered: boolean }[] {
    const results: { url: string; spoilered: boolean }[] = [];

    // Skip URLs that start with $ or are wrapped in <>
    const skipPattern = /\$https?:\/\/|<https?:\/\/[^>]+>/g;
    const cleanContent = content.replace(skipPattern, "");

    // Match spoilered URLs: ||url||
    const spoilerPattern = /\|\|(https?:\/\/[^\s|]+)\|\|/g;
    let spoilerMatch: RegExpExecArray | null;
    while ((spoilerMatch = spoilerPattern.exec(content)) !== null) {
        results.push({ url: spoilerMatch[1]!, spoilered: true });
    }

    // Match regular URLs
    const urlPattern = /(https?:\/\/[^\s<>|]+)/g;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = urlPattern.exec(cleanContent)) !== null) {
        // Skip if already added as spoilered
        if (!results.some(r => r.url === urlMatch![1])) {
            results.push({ url: urlMatch[1]!, spoilered: false });
        }
    }

    return results;
}

/**
 * Find matching platform for a URL
 * @param url - URL to check
 * @returns Matching platform configuration or null
 */
export function findPlatform(url: string): PlatformConfig | null {
    for (const platform of PLATFORMS) {
        for (const pattern of platform.patterns) {
            if (pattern.test(url)) {
                return platform;
            }
        }
    }
    return null;
}

/**
 * Apply domain fix to URL
 * @param url - Original URL
 * @param platform - Platform configuration
 * @returns Fixed URL
 */
export function applyFix(url: string, platform: PlatformConfig): string {
    let fixedUrl = url;
    for (const fix of platform.fixes) {
        if (url.includes(fix.oldDomain)) {
            fixedUrl = url.replace(fix.oldDomain, fix.newDomain);
            break;
        }
    }
    return fixedUrl;
}

/**
 * Extract status/post ID from URL based on platform
 * @param url - URL to extract from
 * @param platform - Platform configuration
 * @returns Extracted ID or null
 */
export function extractPostId(url: string, platform: PlatformConfig): string | null {
    switch (platform.id) {
        case PlatformId.TWITTER: {
            const twitterMatch = url.match(/\/status\/(\d+)/);
            return twitterMatch?.[1] ?? null;
        }
        case PlatformId.BLUESKY: {
            const bskyMatch = url.match(/\/post\/(\w+)/);
            return bskyMatch?.[1] ?? null;
        }
        case PlatformId.PIXIV: {
            const pixivMatch = url.match(/\/artworks\/(\d+)/);
            return pixivMatch?.[1] ?? null;
        }
        case PlatformId.NYAA: {
            const nyaaMatch = url.match(/\/view\/(\d+)/);
            return nyaaMatch?.[1] ?? null;
        }
        default:
            return null;
    }
}

/**
 * Process URLs in a message
 * @param content - Message content
 * @param disabledPlatforms - List of disabled platform IDs
 * @returns Array of processed URLs
 */
export function processUrls(content: string, disabledPlatforms: PlatformId[] = []): ProcessedUrl[] {
    const urls = extractUrls(content);
    const results: ProcessedUrl[] = [];

    for (const { url, spoilered } of urls) {
        const platform = findPlatform(url);
        if (platform && !disabledPlatforms.includes(platform.id)) {
            results.push({
                originalUrl: url,
                fixedUrl: applyFix(url, platform),
                platform,
                postId: extractPostId(url, platform),
                spoilered
            });
        }
    }

    return results;
}
