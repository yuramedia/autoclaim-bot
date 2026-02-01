/**
 * Message Handler
 * Handles messageCreate events to fix social media embeds
 */

import { Message, EmbedBuilder, AttachmentBuilder, MessageFlags } from "discord.js";
import { processUrls, PlatformId, type ProcessedUrl } from "../services/embed-fix";
import { downloadMedia } from "../services/media-downloader";
import { fetchPostInfo, buildRichEmbed } from "../services/embed-builder";
import { getGuildSettings } from "../database/models/GuildSettings";

// Cache to avoid processing same message twice
const processedMessages = new Set<string>();
const CACHE_TTL = 60000; // 1 minute

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
    const DOWNLOADABLE_PLATFORMS: PlatformId[] = [
        PlatformId.TWITTER,
        PlatformId.TIKTOK,
        PlatformId.INSTAGRAM,
        PlatformId.REDDIT,
        PlatformId.FACEBOOK,
        PlatformId.THREADS
    ];

    const canDownload = DOWNLOADABLE_PLATFORMS.includes(processed.platform.id);

    // Try to fetch rich post info
    if (settings.embedFix.richEmbeds) {
        const postInfo = await fetchPostInfo(processed.originalUrl, processed.platform, processed.postId);

        if (postInfo) {
            const richEmbed = buildRichEmbed(postInfo, processed.platform);
            embeds.push(richEmbed);

            // Try to download and upload media if enabled (only for supported platforms)
            if (settings.embedFix.autoUpload && postInfo.video && canDownload) {
                const downloadResult = await downloadMedia(processed.originalUrl);

                if (downloadResult.success && downloadResult.buffer) {
                    const attachment = new AttachmentBuilder(downloadResult.buffer, {
                        name: processed.spoilered ? `SPOILER_${downloadResult.filename}` : downloadResult.filename
                    });
                    files.push(attachment);
                }
            }
        }
    }

    // If no rich embed, use fixed URL or try download
    if (embeds.length === 0) {
        // For platforms with download support, try to download media
        if (settings.embedFix.autoUpload && canDownload) {
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
