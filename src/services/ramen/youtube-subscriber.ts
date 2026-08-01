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
    const embed = new EmbedBuilder()
        .setColor(YT_COLOR)
        .setAuthor({
            name: video.channelName,
            url: video.channelUrl,
            iconURL: YT_ICON
        })
        .setTitle(video.title)
        .setURL(video.videoUrl)
        .setTimestamp(video.publishedAt);

    if (video.description) {
        embed.setDescription(video.description);
    }

    if (video.thumbnail) {
        embed.setImage(video.thumbnail);
    }

    embed.setFooter({ text: "YouTube Feed" });

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
