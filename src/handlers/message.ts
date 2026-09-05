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
import { getCachedGuildSettings, type IGuildSettings } from "../database/models/guild-settings";
import { getMaxDownloadSize } from "../constants/media-downloader";
import { checkAntihack } from "./antihack";
import { logger } from "../core/logger";

import type { VKRFormat } from "../types/media-downloader";

/**
 * Cache for storing video URLs and format details for interactive resolution selection.
 */
export const videoSelectionCache = new Map<string, { url: string; platform: PlatformId; formats?: VKRFormat[] }>();

// Cache to avoid processing same message twice
const processedMessages = new Set<string>();
const CACHE_TTL = 60000; // 1 minute
const VIDEO_SELECTION_TTL = 15 * 60 * 1000; // 15 minutes
const MAX_VIDEO_SELECTIONS = 200;

/**
 * Creates a resolution selection menu for oversized videos.
 * @param formats - Available video formats
 * @param url - Original video URL
 * @param platform - Platform ID
 * @returns Object containing the select menu and selection ID
 */
function createResolutionSelectMenu(
    formats: VKRFormat[],
    url: string,
    platform: PlatformId
): { selectMenu: StringSelectMenuBuilder; selectionId: string } {
    const selectionId = Date.now().toString(36) + Math.random().toString(36).substring(2);

    // Bound the cache to avoid memory leaks from excessive pending video selections
    if (videoSelectionCache.size >= MAX_VIDEO_SELECTIONS) {
        const oldestKey = videoSelectionCache.keys().next().value;
        if (oldestKey) videoSelectionCache.delete(oldestKey);
    }

    videoSelectionCache.set(selectionId, {
        url,
        platform,
        formats
    });
    setTimeout(() => videoSelectionCache.delete(selectionId), VIDEO_SELECTION_TTL);

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`res_select|${selectionId}`)
        .setPlaceholder("Video too large. Select a smaller resolution.")
        .addOptions(
            formats
                .slice(0, 25)
                .map((fmt, idx) =>
                    new StringSelectMenuOptionBuilder()
                        .setLabel(`${fmt.format_id || "Unknown"} ${fmt.size ? `(${fmt.size})` : ""}`)
                        .setValue(idx.toString())
                )
        );

    return { selectMenu, selectionId };
}

/**
 * Handles the messageCreate event. Checks if the message contains social media URLs,
 * retrieves the appropriate rich embeds or media files according to guild settings,
 * posts them as a reply, and suppresses the original embeds.
 * @param message - The Discord message created
 * @returns A promise that resolves when handling is complete
 */
export async function handleMessage(message: Message): Promise<void> {
    try {
        // Skip if no guild (DMs)
        if (!message.guild) return;

        // Skip bot messages
        if (message.author.bot) return;

        // Skip webhook messages
        if (message.webhookId) return;

        // Get guild settings once (cached, single DB read per TTL window)
        // and share it with the antihack check to avoid a duplicate query.
        const settings = await getCachedGuildSettings(message.guild.id);

        // Antihack: check if this is a trap channel message
        // If triggered (user banned), stop all further processing
        const antihackTriggered = await checkAntihack(message, settings);
        if (antihackTriggered) return;

        // Skip if already processed
        if (processedMessages.has(message.id)) return;
        processedMessages.add(message.id);
        setTimeout(() => processedMessages.delete(message.id), CACHE_TTL);

        // Skip if embed fix is disabled
        if (!settings.embedFix.enabled) return;

        // Process URLs in message
        const processedUrls = processUrls(message.content, settings.embedFix.disabledPlatforms as PlatformId[]);

        // Skip if no URLs found
        if (processedUrls.length === 0) return;

        try {
            // Process each URL in parallel
            await Promise.all(processedUrls.map(processed => processUrl(message, processed, settings)));

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
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            logger.error("Error processing embed fix: %s", msg);
        }
    } catch (outerError: unknown) {
        const msg = outerError instanceof Error ? outerError.message : String(outerError);
        logger.error("Unexpected error in handleMessage: %s", msg);
    }
}

/**
 * Processes a single URL found in a message.
 * Depending on the platform, builds rich embeds, downloads and attaches media files,
 * or attaches resolution selection menus if the video size exceeds the server's limit.
 * @param message - The original Discord message
 * @param processed - The processed URL details
 * @param settings - The guild settings configuration
 * @returns A promise that resolves when processing is complete
 */
async function processUrl(message: Message, processed: ProcessedUrl, settings: IGuildSettings): Promise<void> {
    try {
        const embeds: EmbedBuilder[] = [];
        const files: AttachmentBuilder[] = [];
        const components: Array<ActionRowBuilder<StringSelectMenuBuilder | import("discord.js").ButtonBuilder>> = [];
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
                const { fetchNyaaInfo, buildNyaaEmbed, fetchNyaaComment, buildNyaaCommentEmbed } =
                    await import("../services/nyaa");
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
                            commentData.infoHash,
                            viewId
                        );
                        embeds.push(...commentEmbeds);
                    }
                } else {
                    const nyaaInfo = await fetchNyaaInfo(viewId, provider);
                    if (nyaaInfo) {
                        const nyaaEmbeds = await buildNyaaEmbed(nyaaInfo, processed.originalUrl, provider, viewId);
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
        // Custom flow for AmeNZB (Deprecated)
        else if (processed.platform.id === PlatformId.AMENZB && processed.postId) {
            logger.warn(`[AmeNZB] Received link for deprecated platform AmeNZB: ${processed.originalUrl}`);
            const { buildAmeNZBEmbed } = await import("../services/amenzb");
            const amenzbEmbed = await buildAmeNZBEmbed(processed.postId, processed.originalUrl);
            if (amenzbEmbed) {
                embeds.push(amenzbEmbed);
            }
        }
        // Custom flow for Tsukihime
        else if (processed.platform.id === PlatformId.TSUKIHIME && processed.postId) {
            const { buildTsukihimeEmbed } = await import("../services/tsukihime");
            const torrentId = parseInt(processed.postId, 10);
            if (!isNaN(torrentId)) {
                const tsukihimeEmbed = await buildTsukihimeEmbed(torrentId, processed.originalUrl);
                if (tsukihimeEmbed) {
                    embeds.push(...tsukihimeEmbed.embeds);
                    if (tsukihimeEmbed.components) {
                        components.push(...tsukihimeEmbed.components);
                    }
                    if (tsukihimeEmbed.files) {
                        files.push(...tsukihimeEmbed.files);
                    }
                }
            }
        }
        // Try to fetch rich post info for other platforms
        else if (settings.embedFix.richEmbeds) {
            const { fetchPostInfo, buildRichEmbed } = await import("../services/embed-builder");
            const postInfo = await fetchPostInfo(processed.fixedUrl, processed.platform, processed.postId);

            if (postInfo) {
                const richEmbeds = buildRichEmbed(postInfo, processed.platform, processed.originalUrl);
                embeds.push(...richEmbeds);

                // Try to download and upload media if enabled (only for supported platforms)
                if (settings.embedFix.autoUpload && postInfo.video && canDownload) {
                    let downloadResult;

                    if (processed.platform.id === PlatformId.FACEBOOK) {
                        // Facebook video URLs from our scraper are direct mp4 links
                        const directDownloader = await import("../services/media-downloader");
                        downloadResult = await directDownloader.downloadDirect(
                            postInfo.video,
                            "facebook_video.mp4",
                            maxSizeLimit
                        );

                        // If direct download fails (e.g. maxContentLength exceeded), fallback to VKrDownloader
                        // which might offer lower resolutions via the select menu
                        if (!downloadResult.success) {
                            downloadResult = await directDownloader.downloadMedia(processed.originalUrl, maxSizeLimit);
                        }
                    } else {
                        const { downloadMedia } = await import("../services/media-downloader");
                        downloadResult = await downloadMedia(processed.originalUrl, maxSizeLimit);
                    }

                    if (downloadResult.success && downloadResult.buffer) {
                        const attachment = new AttachmentBuilder(downloadResult.buffer, {
                            name: processed.spoilered ? `SPOILER_${downloadResult.filename}` : downloadResult.filename
                        });
                        files.push(attachment);
                    } else if (downloadResult.oversized && downloadResult.availableFormats) {
                        const { selectMenu } = createResolutionSelectMenu(
                            downloadResult.availableFormats,
                            processed.originalUrl,
                            processed.platform.id
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
                const { downloadMedia } = await import("../services/media-downloader");
                const downloadResult = await downloadMedia(processed.originalUrl, maxSizeLimit);

                if (downloadResult.success && downloadResult.buffer) {
                    const attachment = new AttachmentBuilder(downloadResult.buffer, {
                        name: processed.spoilered ? `SPOILER_${downloadResult.filename}` : downloadResult.filename
                    });
                    files.push(attachment);
                } else if (downloadResult.oversized && downloadResult.availableFormats) {
                    const { selectMenu } = createResolutionSelectMenu(
                        downloadResult.availableFormats,
                        processed.originalUrl,
                        processed.platform.id
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
            embeds: embeds.length > 0 ? embeds.slice(0, 10) : undefined,
            files,
            components: components.length > 0 ? components : undefined,
            allowedMentions: { repliedUser: false }
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[processUrl] Error processing URL ${processed.originalUrl}: ${msg}`);
    }
}
