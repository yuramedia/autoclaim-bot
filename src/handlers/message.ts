/**
 * Message Handler
 * Handles messageCreate events to fix social media embeds
 */

import { Message, EmbedBuilder, AttachmentBuilder, MessageFlags } from "discord.js";
import { processUrls, PlatformId, type ProcessedUrl } from "../services/embed-fix";
import { downloadMedia } from "../services/media-downloader";
import { fetchPostInfo, buildRichEmbed } from "../services/embed-builder";
import { getGuildSettings } from "../database/models/GuildSettings";
import axios from "axios";

// Cache to avoid processing same message twice
const processedMessages = new Set<string>();
const CACHE_TTL = 60000; // 1 minute
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Download media directly from a URL
 */
async function downloadFromUrl(
    url: string,
    filename: string
): Promise<{ success: boolean; buffer?: Buffer; filename: string }> {
    try {
        const response = await axios.get(url, {
            responseType: "arraybuffer",
            timeout: 60000,
            maxContentLength: MAX_FILE_SIZE,
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
            }
        });

        const buffer = Buffer.from(response.data);
        if (buffer.length <= MAX_FILE_SIZE) {
            return { success: true, buffer, filename };
        }
        return { success: false, filename };
    } catch (error) {
        console.error("Direct download failed:", error);
        return { success: false, filename };
    }
}

/**
 * Handle message create event
 */
export async function handleMessage(message: Message): Promise<void> {
    // Skip if no guild (DMs)
    if (!message.guild) return;

    // Skip bot messages
    if (message.author.bot) return;

    // Skip webhook messages
    if (message.webhookId) return;

    // Skip if already processed
    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), CACHE_TTL);

    // Get guild settings
    const settings = await getGuildSettings(message.guild.id);

    // Skip if embed fix is disabled
    if (!settings.embedFix.enabled) return;

    // Process URLs in message
    const processedUrls = processUrls(message.content, settings.embedFix.disabledPlatforms as PlatformId[]);

    // Skip if no URLs found
    if (processedUrls.length === 0) return;

    try {
        // Process each URL
        for (const processed of processedUrls) {
            await processUrl(message, processed, settings);
        }
    } catch (error) {
        console.error("Error processing embed fix:", error);
    }
}

/**
 * Process a single URL
 */
async function processUrl(message: Message, processed: ProcessedUrl, settings: any): Promise<void> {
    const embeds: EmbedBuilder[] = [];
    const files: AttachmentBuilder[] = [];
    let content = "";

    // Platforms that VKrDownloader supports (video platforms only)
    const VKRDOWNLOADER_PLATFORMS: PlatformId[] = [
        PlatformId.TWITTER,
        PlatformId.TIKTOK,
        PlatformId.INSTAGRAM,
        PlatformId.REDDIT,
        PlatformId.THREADS
    ];

    // Platforms that support direct download from scraped URLs
    const DIRECT_DOWNLOAD_PLATFORMS: PlatformId[] = [PlatformId.FACEBOOK];

    const canUseVkr = VKRDOWNLOADER_PLATFORMS.includes(processed.platform.id);
    const canDirectDownload = DIRECT_DOWNLOAD_PLATFORMS.includes(processed.platform.id);

    // Try to fetch rich post info
    if (settings.embedFix.richEmbeds) {
        const postInfo = await fetchPostInfo(processed.originalUrl, processed.platform, processed.postId);

        if (postInfo) {
            const richEmbed = buildRichEmbed(postInfo, processed.platform);

            // Try to download and upload media if enabled
            if (settings.embedFix.autoUpload) {
                // For Facebook: download directly from the scraped video/image URL
                if (canDirectDownload && (postInfo.video || postInfo.images.length > 0)) {
                    const mediaUrl = postInfo.video || postInfo.images[0];
                    if (mediaUrl) {
                        const ext = postInfo.video ? "mp4" : "jpg";
                        const filename = processed.spoilered
                            ? `SPOILER_facebook_${Date.now()}.${ext}`
                            : `facebook_${Date.now()}.${ext}`;
                        const downloadResult = await downloadFromUrl(mediaUrl, filename);

                        if (downloadResult.success && downloadResult.buffer) {
                            const attachment = new AttachmentBuilder(downloadResult.buffer, {
                                name: downloadResult.filename
                            });
                            files.push(attachment);

                            // Set the downloaded media as the embed image
                            if (!postInfo.video) {
                                richEmbed.setImage(`attachment://${downloadResult.filename}`);
                            }
                        }
                    }
                }
                // For other platforms: use VKrDownloader
                else if (canUseVkr && postInfo.video) {
                    const downloadResult = await downloadMedia(processed.originalUrl);

                    if (downloadResult.success && downloadResult.buffer) {
                        const attachment = new AttachmentBuilder(downloadResult.buffer, {
                            name: processed.spoilered ? `SPOILER_${downloadResult.filename}` : downloadResult.filename
                        });
                        files.push(attachment);
                    }
                }
            }

            embeds.push(richEmbed);
        }
    }

    // If no rich embed, use fixed URL or try download
    if (embeds.length === 0) {
        // For platforms with VKrDownloader support, try to download media
        if (settings.embedFix.autoUpload && canUseVkr) {
            const downloadResult = await downloadMedia(processed.originalUrl);

            if (downloadResult.success && downloadResult.buffer) {
                const attachment = new AttachmentBuilder(downloadResult.buffer, {
                    name: processed.spoilered ? `SPOILER_${downloadResult.filename}` : downloadResult.filename
                });
                files.push(attachment);
            } else if (processed.fixedUrl !== processed.originalUrl) {
                // Fallback to fixed URL
                content = processed.spoilered ? `||${processed.fixedUrl}||` : processed.fixedUrl;
            }
        } else if (processed.fixedUrl !== processed.originalUrl) {
            // Just send fixed URL (for Pixiv, Bluesky, etc.)
            content = processed.spoilered ? `||${processed.fixedUrl}||` : processed.fixedUrl;
        }
    }

    // Skip if nothing to send
    if (!content && embeds.length === 0 && files.length === 0) return;

    // Reply to the message
    await message.reply({
        content: content || undefined,
        embeds,
        files,
        allowedMentions: { repliedUser: false }
    });

    // Suppress original embeds
    try {
        if (message.embeds.length > 0 || processedUrls.length > 0) {
            await message.suppressEmbeds(true);
        }
    } catch (error) {
        // Ignore if we don't have permission
    }
}

// Store processedUrls in module scope for suppressEmbeds check
let processedUrls: ProcessedUrl[] = [];
