import { EmbedBuilder, ChannelType } from "discord.js";
import { client } from "../../core/client";
import { ramen } from "../../core/ramen";
import { logger } from "../../core/logger";
import type { FormattedYouTubeVideo } from "../../types/youtube-feed";
import { YT_COLOR, YT_ICON } from "../../constants/youtube-feed";

/**
 * Event data interface for new YouTube videos sent over RAMEN bus.
 */
export interface YouTubeNewVideosEvent {
    videos: FormattedYouTubeVideo[];
    targets: string[]; // List of Discord channel IDs
}

/**
 * Delay between sending embeds to different Discord channels (ms).
 * Prevents hitting Discord API rate limits on burst sends.
 */
const DISCORD_SEND_DELAY = 500;

/**
 * Sleep for a given number of milliseconds.
 * @param ms Milliseconds to sleep
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build a Discord embed for a YouTube video notification.
 * @param video Formatted video data
 * @returns Discord EmbedBuilder instance
 */
function buildVideoEmbed(video: FormattedYouTubeVideo): EmbedBuilder {
    let statusPrefix = "";
    let embedColor = YT_COLOR; // 0xFF0000 (red)
    let footerText = "YouTube Feed";

    if (video.statusType === "upcoming") {
        statusPrefix = "⏳ [UPCOMING PREMIERE] ";
        embedColor = 0xffa500; // Orange
        footerText = "YouTube Feed • Scheduled Premiere / Stream";
    } else if (video.statusType === "live") {
        statusPrefix = "🔴 [LIVE NOW] ";
        embedColor = 0xff0000; // Red
        footerText = "YouTube Feed • Live Now";
    } else if (video.statusType === "members_only") {
        statusPrefix = "🟢 [MEMBERS ONLY] ";
        embedColor = 0x2ecc71; // Green
        footerText = "YouTube Feed • Members-Only Content";
    } else {
        statusPrefix = "🎬 [NEW VIDEO] ";
        footerText = "YouTube Feed • New Upload";
    }

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setAuthor({
            name: video.channelName,
            url: video.channelUrl,
            iconURL: video.channelIcon || YT_ICON
        })
        .setTitle(`${statusPrefix}${video.title}`)
        .setURL(video.videoUrl)
        .setTimestamp(video.publishedAt);

    if (video.description) {
        embed.setDescription(video.description);
    }

    if (video.statusType === "upcoming" && video.scheduledStartTimeUnix) {
        embed.addFields({
            name: "📅 Scheduled Premiere",
            value: `<t:${video.scheduledStartTimeUnix}:F> (<t:${video.scheduledStartTimeUnix}:R>)`,
            inline: false
        });
    } else if (video.statusType === "live" && video.scheduledStartTimeUnix) {
        embed.addFields({
            name: "🕒 Live Stream Start Time",
            value: `<t:${video.scheduledStartTimeUnix}:F> (<t:${video.scheduledStartTimeUnix}:R>)`,
            inline: false
        });
    }

    if (video.thumbnail) {
        embed.setImage(video.thumbnail);
    }

    embed.setFooter({ text: footerText });

    return embed;
}

ramen.subscribe<YouTubeNewVideosEvent>("youtube:new_videos", async (data): Promise<void> => {
    try {
        const { videos, targets } = data;
        let sentCount = 0;

        for (let i = 0; i < targets.length; i++) {
            const channelId = targets[i]!;
            try {
                // Stagger sends between different Discord channels
                if (i > 0) {
                    await sleep(DISCORD_SEND_DELAY);
                }

                const channel =
                    client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId).catch(() => null));
                if (
                    channel &&
                    (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement)
                ) {
                    for (const video of videos) {
                        const embed = buildVideoEmbed(video);
                        const message = await channel.send({ embeds: [embed] });

                        // Cross-post if the channel is an announcement channel
                        if (channel.type === ChannelType.GuildAnnouncement) {
                            try {
                                await message.crosspost();
                            } catch {
                                // Missing permissions for crosspost — ignore
                            }
                        }
                        sentCount++;
                    }
                }
            } catch (error: unknown) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger.error(err, `RAMEN: Failed to send YouTube feed to channel ${channelId}`);
            }
        }

        if (sentCount > 0) {
            logger.info(
                `🎥 RAMEN: Sent ${videos.length} YouTube video(s) to ${targets.length} channel(s) (${sentCount} embeds total)`
            );
        }
    } catch (outerError: unknown) {
        const err = outerError instanceof Error ? outerError : new Error(String(outerError));
        logger.error(err, "RAMEN: Unexpected error in youtube:new_videos subscriber");
    }
});

logger.info("🍜 RAMEN Subscriber registered: youtube:new_videos");
