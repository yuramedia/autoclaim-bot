/**
 * Message Handler
 * Handles messageCreate events to fix social media embeds
 */

import {
    Message,
    EmbedBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from "discord.js";
import { processUrls, PlatformId, type ProcessedUrl } from "../services/embed-fix";
import { downloadMedia, downloadDirect } from "../services/media-downloader";
import { fetchPostInfo, buildRichEmbed } from "../services/embed-builder";
import {
    fetchNyaaInfo,
    buildNyaaEmbed,
    fetchNyaaComment,
    buildNyaaCommentEmbed,
    fetchGameFromIGDB
} from "../services/nyaa";
import { getGuildSettings } from "../database/models/GuildSettings";
import { getMaxDownloadSize } from "../constants/media-downloader";

// Cache for storing video URLs for interactive resolution selection
export const videoSelectionCache = new Map<
    string,
    { url: string; platform: PlatformId; formats?: import("../types/media-downloader").VKRFormat[] }
>();

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

        // Suppress original embeds after bot has replied
        // Wait briefly for Discord to generate the original embed
        setTimeout(async () => {
            try {
                const updatedMessage = await message.fetch();
                if (updatedMessage.embeds.length > 0) {
                    await updatedMessage.suppressEmbeds(true);
                }
            } catch {
                // Ignore if we don't have permission (Manage Messages required)
            }
        }, 2000);
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
    const components: any[] = [];
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
    const maxSizeLimit = getMaxDownloadSize(message.guild?.premiumTier);

    // Custom flow for Nyaa.si
    if (processed.platform.id === PlatformId.NYAA && processed.postId) {
        // postId format: "nyaa:1273100" or "sukebei:4181966#com-15"
        const match = processed.postId.match(/^(nyaa|sukebei):(\d+)(?:(#com-\d+))?$/);
        if (match) {
            const provider = match[1] as "nyaa" | "sukebei";
            const viewId = match[2]!;
            const commentIdKey = match[3];

            if (commentIdKey) {
                const commentId = commentIdKey.replace("#com-", "");
                const commentData = await fetchNyaaComment(viewId, commentId, provider);
                if (commentData) {
                    const commentEmbeds = await buildNyaaCommentEmbed(
                        commentData.comment,
                        commentData.torrentTitle,
                        processed.originalUrl,
                        provider,
                        commentData.infoHash
                    );
                    embeds.push(...commentEmbeds);
                }
            } else {
                const nyaaInfo = await fetchNyaaInfo(viewId, provider);
                if (nyaaInfo) {
                    // Check if it's a game torrent (Software - Games category) and fetch game metadata
                    if (nyaaInfo.category === "Software - Games") {
                        const gameName = nyaaInfo.title.split(/[[(]/).pop();
                        if (gameName) {
                            const gameMetadata = await fetchGameFromIGDB(gameName.trim());
                            if (gameMetadata) {
                                nyaaInfo.gameMetadata = gameMetadata;
                            }
                        }
                    }
                    const nyaaEmbeds = await buildNyaaEmbed(nyaaInfo, processed.originalUrl, provider);
                    embeds.push(...nyaaEmbeds);
                }
            }
        }
    }
    // Custom flow for NekoBT
    else if (processed.platform.id === PlatformId.NEKOBT && processed.postId) {
        const { buildNekoBTEmbed } = await import("../services/nekobt");
        const nekobtEmbeds = await buildNekoBTEmbed(processed.originalUrl);
        if (nekobtEmbeds) {
            embeds.push(...nekobtEmbeds.embeds);
            if (nekobtEmbeds.components) {
                components.push(...nekobtEmbeds.components);
            }
        }
    }
    // Try to fetch rich post info for other platforms
    else if (settings.embedFix.richEmbeds) {
        const postInfo = await fetchPostInfo(processed.fixedUrl, processed.platform, processed.postId);

        if (postInfo) {
            const richEmbeds = buildRichEmbed(postInfo, processed.platform, processed.originalUrl);
            embeds.push(...richEmbeds);

            // Try to download and upload media if enabled (only for supported platforms)
            if (settings.embedFix.autoUpload && postInfo.video && canDownload) {
                let downloadResult;

                if (processed.platform.id === PlatformId.FACEBOOK) {
                    // Facebook video URLs from our scraper are direct mp4 links
                    downloadResult = await downloadDirect(postInfo.video, "facebook_video.mp4", maxSizeLimit);

                    // If direct download fails (e.g. maxContentLength exceeded), fallback to VKrDownloader
                    // which might offer lower resolutions via the select menu
                    if (!downloadResult.success) {
                        downloadResult = await downloadMedia(processed.originalUrl, maxSizeLimit);
                    }
                } else {
                    downloadResult = await downloadMedia(processed.originalUrl, maxSizeLimit);
                }

                if (downloadResult.success && downloadResult.buffer) {
                    const attachment = new AttachmentBuilder(downloadResult.buffer, {
                        name: processed.spoilered ? `SPOILER_${downloadResult.filename}` : downloadResult.filename
                    });
                    files.push(attachment);
                } else if (downloadResult.oversized && downloadResult.availableFormats) {
                    const selectionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
                    videoSelectionCache.set(selectionId, {
                        url: processed.originalUrl,
                        platform: processed.platform.id,
                        formats: downloadResult.availableFormats
                    });
                    setTimeout(() => videoSelectionCache.delete(selectionId), 15 * 60 * 1000);

                    const selectMenu = new StringSelectMenuBuilder()
                        .setCustomId(`res_select|${selectionId}`)
                        .setPlaceholder("Video too large. Select a smaller resolution.")
                        .addOptions(
                            downloadResult.availableFormats
                                .slice(0, 25)
                                .map((fmt, idx) =>
                                    new StringSelectMenuOptionBuilder()
                                        .setLabel(`${fmt.format_id || "Unknown"} ${fmt.size ? `(${fmt.size})` : ""}`)
                                        .setValue(idx.toString())
                                )
                        );
                    components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
                }
            }
        }
    }

    // If no rich embed, use fixed URL or try download
    if (embeds.length === 0) {
        // For platforms with download support, try to download media
        if (settings.embedFix.autoUpload && canDownload) {
            const downloadResult = await downloadMedia(processed.originalUrl, maxSizeLimit);

            if (downloadResult.success && downloadResult.buffer) {
                const attachment = new AttachmentBuilder(downloadResult.buffer, {
                    name: processed.spoilered ? `SPOILER_${downloadResult.filename}` : downloadResult.filename
                });
                files.push(attachment);
            } else if (downloadResult.oversized && downloadResult.availableFormats) {
                const selectionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
                videoSelectionCache.set(selectionId, {
                    url: processed.originalUrl,
                    platform: processed.platform.id,
                    formats: downloadResult.availableFormats
                });
                setTimeout(() => videoSelectionCache.delete(selectionId), 15 * 60 * 1000);

                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId(`res_select|${selectionId}`)
                    .setPlaceholder("Video too large. Select a smaller resolution.")
                    .addOptions(
                        downloadResult.availableFormats
                            .slice(0, 25)
                            .map((fmt, idx) =>
                                new StringSelectMenuOptionBuilder()
                                    .setLabel(`${fmt.format_id || "Unknown"} ${fmt.size ? `(${fmt.size})` : ""}`)
                                    .setValue(idx.toString())
                            )
                    );
                components.push(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu));
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
    if (!content && embeds.length === 0 && files.length === 0 && components.length === 0) return;

    // Reply to the message
    await message.reply({
        content: content || undefined,
        embeds,
        files,
        components: components.length > 0 ? components : undefined,
        allowedMentions: { repliedUser: false }
    });
}
