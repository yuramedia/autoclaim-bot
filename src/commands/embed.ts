/**
 * Embed Command
 * Manually generate a rich embed from a supported URL
 * Mirrors the full message handler embed pipeline:
 *  - Platform detection & rich embeds (Twitter, Bluesky, Facebook, etc.)
 *  - Nyaa.si / Sukebei torrent embeds (with comment support)
 *  - NekoBT torrent embeds
 *  - Media download & upload for video platforms
 *  - Resolution select menu for oversized videos
 *  - Fixed-URL fallback for remaining platforms
 *
 * Usage: /embed url:<url>
 */

import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    EmbedBuilder,
    AttachmentBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} from "discord.js";
import { findPlatform, applyFix, extractPostId } from "../services/embed-fix";
import { fetchPostInfo, buildRichEmbed } from "../services/embed-builder";
import {
    fetchNyaaInfo,
    buildNyaaEmbed,
    fetchNyaaComment,
    buildNyaaCommentEmbed,
    fetchGameFromIGDB
} from "../services/nyaa";
import { buildNekoBTEmbed } from "../services/nekobt";
import { downloadMedia, downloadDirect } from "../services/media-downloader";
import type { DownloadResult } from "../types/media-downloader";
import { PlatformId } from "../types/embed-fix";
import { PLATFORMS } from "../constants/embed-fix";
import { getMaxDownloadSize } from "../constants/media-downloader";
import { videoSelectionCache } from "../handlers/message";

export const data = new SlashCommandBuilder()
    .setName("embed")
    .setDescription("Generate a rich embed from a supported URL")
    .addStringOption(opt => opt.setName("url").setDescription("URL to generate embed for").setRequired(true));

/** Platforms that VKrDownloader supports (video download) */
const DOWNLOADABLE_PLATFORMS: PlatformId[] = [
    PlatformId.TWITTER,
    PlatformId.TIKTOK,
    PlatformId.INSTAGRAM,
    PlatformId.REDDIT,
    PlatformId.FACEBOOK,
    PlatformId.THREADS
];

/**
 * Build a resolution-select action row from an oversized download result.
 * Stores available formats in the shared videoSelectionCache so the
 * resolution-select handler can look up the full URL by index.
 */
function buildResolutionSelect(
    downloadResult: DownloadResult,
    url: string,
    platformId: PlatformId
): ActionRowBuilder<StringSelectMenuBuilder> | null {
    if (!downloadResult.oversized || !downloadResult.availableFormats) return null;

    const selectionId = Date.now().toString(36) + Math.random().toString(36).substring(2);
    videoSelectionCache.set(selectionId, {
        url,
        platform: platformId,
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

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(selectMenu);
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const url = interaction.options.getString("url", true).trim();

    // Validate URL format
    if (!/^https?:\/\//i.test(url)) {
        await interaction.reply({
            content: "❌ Please provide a valid URL starting with `http://` or `https://`.",
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply();

    try {
        const platform = findPlatform(url);

        if (!platform) {
            const supportedPlatforms = PLATFORMS.map(p => p.name).join(", ");
            await interaction.editReply({
                content: `❌ URL not recognized. Supported platforms: ${supportedPlatforms}`
            });
            return;
        }

        const postId = extractPostId(url, platform);
        const fixedUrl = applyFix(url, platform);
        const canDownload = DOWNLOADABLE_PLATFORMS.includes(platform.id);
        const maxSizeLimit = getMaxDownloadSize(interaction.guild?.premiumTier ?? 0);

        let embeds: EmbedBuilder[] = [];
        let files: AttachmentBuilder[] = [];
        let components: ActionRowBuilder<any>[] = [];

        // ── Platform-specific rich embeds ────────────────────────────

        switch (platform.id) {
            // Nyaa.si / Sukebei (torrent page & comment links)
            case PlatformId.NYAA: {
                if (postId) {
                    const match = postId.match(/^(nyaa|sukebei):(\d+)(?:(#com-\d+))?$/);
                    if (match) {
                        const provider = match[1] as "nyaa" | "sukebei";
                        const viewId = match[2]!;
                        const commentIdKey = match[3];

                        if (commentIdKey) {
                            // Comment-specific embed
                            const commentId = commentIdKey.replace("#com-", "");
                            const commentData = await fetchNyaaComment(viewId, commentId, provider);
                            if (commentData) {
                                const commentEmbeds = await buildNyaaCommentEmbed(
                                    commentData.comment,
                                    commentData.torrentTitle,
                                    url,
                                    provider,
                                    commentData.infoHash
                                );
                                embeds.push(...commentEmbeds);
                            }
                        } else {
                            // Torrent page embed
                            const info = await fetchNyaaInfo(viewId, provider);
                            if (info) {
                                // Check if it's a game torrent (Software - Games category) and fetch game metadata
                                if (info.category === "Software - Games") {
                                    const gameName = info.title.split(/[[(]/).pop();
                                    if (gameName) {
                                        const gameMetadata = await fetchGameFromIGDB(gameName.trim());
                                        if (gameMetadata) {
                                            info.gameMetadata = gameMetadata;
                                        }
                                    }
                                }
                                const nyaaEmbeds = await buildNyaaEmbed(info, url, provider);
                                embeds.push(...nyaaEmbeds);
                            }
                        }
                    }
                }
                break;
            }

            // NekoBT torrent embeds
            case PlatformId.NEKOBT: {
                const nekoData = await buildNekoBTEmbed(url);
                if (nekoData) {
                    embeds.push(...nekoData.embeds);
                    if (nekoData.components) {
                        components.push(...nekoData.components);
                    }
                }
                break;
            }

            // All other platforms: rich embed + optional media download
            default: {
                const info = await fetchPostInfo(url, platform, postId);

                if (info) {
                    embeds.push(...buildRichEmbed(info, platform, url));

                    // Try to download & upload video when available
                    if (info.video && canDownload) {
                        let downloadResult;

                        if (platform.id === PlatformId.FACEBOOK || platform.id === PlatformId.TIKTOK) {
                            downloadResult = await downloadDirect(info.video, `${platform.id}_video.mp4`, maxSizeLimit);
                            if (!downloadResult.success) {
                                downloadResult = await downloadMedia(url, maxSizeLimit);
                            }
                        } else {
                            downloadResult = await downloadMedia(url, maxSizeLimit);
                        }

                        if (downloadResult.success && downloadResult.buffer) {
                            files.push(new AttachmentBuilder(downloadResult.buffer, { name: downloadResult.filename }));
                        } else {
                            const row = buildResolutionSelect(downloadResult, url, platform.id);
                            if (row) components.push(row);
                        }
                    }
                }

                // If no rich embed was produced, try downloading media directly
                if (embeds.length === 0 && files.length === 0 && canDownload) {
                    const downloadResult = await downloadMedia(url, maxSizeLimit);

                    if (downloadResult.success && downloadResult.buffer) {
                        files.push(new AttachmentBuilder(downloadResult.buffer, { name: downloadResult.filename }));
                    } else {
                        const row = buildResolutionSelect(downloadResult, url, platform.id);
                        if (row) components.push(row);
                    }
                }

                break;
            }
        }

        // ── Send result ──────────────────────────────────────────────

        if (embeds.length > 0 || files.length > 0) {
            await interaction.editReply({
                embeds: embeds.length > 0 ? embeds : undefined,
                files: files.length > 0 ? files : undefined,
                components: components.length > 0 ? components : undefined
            });
            return;
        }

        // Fallback: if platform has domain fixes, show the fixed URL
        if (fixedUrl !== url) {
            await interaction.editReply({ content: fixedUrl });
            return;
        }

        // No rich embed, no download, no fix available
        await interaction.editReply({
            content: `ℹ️ No embed data could be fetched for this **${platform.name}** URL.`
        });
    } catch (error) {
        console.error("[Embed Command] Error:", error);
        await interaction.editReply({
            content: "❌ An error occurred while generating the embed."
        });
    }
}
