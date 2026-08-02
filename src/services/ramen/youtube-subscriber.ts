import { TextChannel, EmbedBuilder } from "discord.js";
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

function buildVideoEmbed(video: FormattedYouTubeVideo): EmbedBuilder {
    let statusPrefix = "";
    let embedColor = YT_COLOR; // 0xFF0000 (red)
    let footerText = "YouTube Feed";

    if (video.statusType === "upcoming") {
        statusPrefix = "⏳ [AKAN SEGERA TAYANG] ";
        embedColor = 0xffa500; // Orange
        footerText = "YouTube Feed • Scheduled Premiere / Stream";
    } else if (video.statusType === "live") {
        statusPrefix = "🔴 [SEKARANG TAYANG] ";
        embedColor = 0xff0000; // Red
        footerText = "YouTube Feed • Live Now";
    } else if (video.statusType === "members_only") {
        statusPrefix = "🟢 [KHUSUS PELANGGAN] ";
        embedColor = 0x2ecc71; // Green
        footerText = "YouTube Feed • Members-Only Content";
    } else {
        statusPrefix = "🎬 [VIDEO BARU] ";
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
            name: "📅 Jadwal Tayang",
            value: `<t:${video.scheduledStartTimeUnix}:F> (<t:${video.scheduledStartTimeUnix}:R>)`,
            inline: false
        });
    } else if (video.statusType === "live" && video.scheduledStartTimeUnix) {
        embed.addFields({
            name: "🕒 Waktu Mulai Tayang",
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

        for (const channelId of targets) {
            try {
                const channel = client.channels.cache.get(channelId);
                if (channel && channel instanceof TextChannel) {
                    for (const video of videos) {
                        const embed = buildVideoEmbed(video);
                        const message = await channel.send({ embeds: [embed] });

                        // Cross-post if the channel is an announcement channel
                        try {
                            await message.crosspost();
                        } catch {
                            // Not an announcement channel or missing permissions — ignore
                        }
                    }
                }
            } catch (error: unknown) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger.error(err, `RAMEN: Failed to send YouTube feed to channel ${channelId}`);
            }
        }
    } catch (outerError: unknown) {
        const err = outerError instanceof Error ? outerError : new Error(String(outerError));
        logger.error(err, "RAMEN: Unexpected error in youtube:new_videos subscriber");
    }
});

logger.info("🍜 RAMEN Subscriber registered: youtube:new_videos");
