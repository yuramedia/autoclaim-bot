/**
 * /youtube command
 * Configure YouTube channel RSS feed notifications
 */

import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    TextChannel,
    EmbedBuilder,
    MessageFlags
} from "discord.js";
import { getGuildSettings, updateYouTubeFeedSettings } from "../database/models/guild-settings";
import { YouTubeFeedService } from "../services/youtube-feed";
import { YT_COLOR, YT_ICON, YT_MAX_CHANNELS_PER_GUILD } from "../constants/youtube-feed";
import { logger } from "../core/logger";

/**
 * Slash command data for the /youtube command.
 */
export const data = new SlashCommandBuilder()
    .setName("youtube")
    .setDescription("Configure YouTube channel feed notifications")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub
            .setName("add")
            .setDescription("Add a YouTube channel to monitor")
            .addStringOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("YouTube channel URL, handle (@username), or channel ID")
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt
                    .setName("region")
                    .setDescription("YouTube catalog region / country (default: Indonesia ID)")
                    .setRequired(false)
                    .addChoices(
                        { name: "Indonesia 🇮🇩 (ID)", value: "ID" },
                        { name: "Japan 🇯🇵 (JP)", value: "JP" },
                        { name: "United States 🇺🇸 (US)", value: "US" },
                        { name: "Singapore 🇸🇬 (SG)", value: "SG" },
                        { name: "Taiwan 🇹🇼 (TW)", value: "TW" },
                        { name: "Hong Kong 🇭🇰 (HK)", value: "HK" },
                        { name: "South Korea 🇰🇷 (KR)", value: "KR" },
                        { name: "Global 🌐 (GLOBAL)", value: "GLOBAL" }
                    )
            )
    )
    .addSubcommand(sub =>
        sub
            .setName("remove")
            .setDescription("Remove a YouTube channel from the watch list")
            .addStringOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("Handle (@username), channel ID, or channel name to remove")
                    .setRequired(true)
            )
    )
    .addSubcommand(sub => sub.setName("list").setDescription("View the list of currently monitored YouTube channels"))
    .addSubcommand(sub =>
        sub
            .setName("enable")
            .setDescription("Enable YouTube feed notifications to a specific channel")
            .addChannelOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("Discord channel to receive notifications")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sub => sub.setName("disable").setDescription("Disable YouTube feed notifications"))
    .addSubcommand(sub => sub.setName("status").setDescription("View current YouTube feed configuration status"));

/**
 * Executes the /youtube command.
 * @param interaction Chat input command interaction.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({
            content: "❌ This command can only be used in a server.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    try {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const settings = await getGuildSettings(guildId);
        const subcommand = interaction.options.getSubcommand();
        const ytService = new YouTubeFeedService();

        switch (subcommand) {
            case "add": {
                const input = interaction.options.getString("channel", true);
                const region = interaction.options.getString("region") || "ID";
                const currentChannels = settings.youtubeFeed?.youtubeChannels || [];

                if (currentChannels.length >= YT_MAX_CHANNELS_PER_GUILD) {
                    await interaction.editReply({
                        content: `❌ Maximum limit of ${YT_MAX_CHANNELS_PER_GUILD} YouTube channels per server reached.`
                    });
                    return;
                }

                const resolved = await ytService.resolveChannelId(input);
                if (!resolved) {
                    await interaction.editReply({
                        content: `❌ Failed to find YouTube channel for \`${input}\`. Ensure the URL, handle, or channel ID is valid.`
                    });
                    return;
                }

                const exists = currentChannels.some(c => c.channelId === resolved.channelId);
                if (exists) {
                    await interaction.editReply({
                        content: `⚠️ YouTube channel **${resolved.channelName}** (\`${resolved.handle}\`) is already on the watch list.`
                    });
                    return;
                }

                // Atomic array replacement — avoids full-document save() racing other writers
                const nextChannels = [
                    ...currentChannels,
                    {
                        channelId: resolved.channelId,
                        channelName: resolved.channelName,
                        handle: resolved.handle,
                        region
                    }
                ];
                const updated = await updateYouTubeFeedSettings(guildId, { youtubeChannels: nextChannels });
                const savedCount = updated.youtubeFeed.youtubeChannels.length;

                const embed = new EmbedBuilder()
                    .setColor(YT_COLOR)
                    .setTitle("✅ YouTube Channel Added")
                    .setThumbnail(resolved.channelIcon || YT_ICON)
                    .addFields(
                        { name: "Channel Name", value: resolved.channelName, inline: true },
                        { name: "Handle", value: resolved.handle, inline: true },
                        { name: "Channel ID", value: `\`${resolved.channelId}\``, inline: true },
                        { name: "Region Catalog", value: `\`${region}\``, inline: true }
                    )
                    .setFooter({
                        text: `Total monitored channels: ${savedCount}/${YT_MAX_CHANNELS_PER_GUILD}`
                    });

                if (!updated.youtubeFeed.enabled || !updated.youtubeFeed.channelId) {
                    embed.setDescription(
                        "⚠️ **Note:** Feed notifications are not enabled yet. Use `/youtube enable` to select a Discord channel."
                    );
                } else {
                    embed.setDescription(`New video notifications will be sent to <#${updated.youtubeFeed.channelId}>`);
                }

                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case "remove": {
                const input = interaction.options.getString("channel", true).trim();
                const currentChannels = settings.youtubeFeed?.youtubeChannels || [];

                if (currentChannels.length === 0) {
                    await interaction.editReply({
                        content: "❌ No YouTube channels have been added to this server yet."
                    });
                    return;
                }

                const resolved = await ytService.resolveChannelId(input);
                const cleanInput = input.toLowerCase();

                const index = currentChannels.findIndex(
                    c =>
                        (resolved && c.channelId.toLowerCase() === resolved.channelId.toLowerCase()) ||
                        c.channelId.toLowerCase() === cleanInput ||
                        c.handle.toLowerCase() === cleanInput ||
                        c.handle.toLowerCase() === `@${cleanInput.replace(/^@/, "")}` ||
                        c.channelName.toLowerCase().includes(cleanInput) ||
                        cleanInput.includes(c.channelId.toLowerCase()) ||
                        cleanInput.includes(c.handle.toLowerCase().replace(/^@/, ""))
                );

                if (index === -1) {
                    await interaction.editReply({
                        content: `❌ YouTube channel \`${input}\` was not found on the watch list.`
                    });
                    return;
                }

                const removed = currentChannels[index];

                // Atomic array replacement — avoids full-document save() racing other writers
                const nextChannels = currentChannels.filter((_, i) => i !== index);
                await updateYouTubeFeedSettings(guildId, { youtubeChannels: nextChannels });

                if (!removed) {
                    await interaction.editReply({
                        content: "❌ Failed to remove YouTube channel."
                    });
                    return;
                }

                await interaction.editReply({
                    content: `✅ Successfully removed **${removed.channelName}** (\`${removed.handle}\`) from the YouTube watch list.`
                });
                break;
            }

            case "list": {
                const channels = settings.youtubeFeed?.youtubeChannels || [];

                if (channels.length === 0) {
                    await interaction.editReply({
                        content:
                            "ℹ️ No YouTube channels are currently monitored in this server. Use `/youtube add` to add one."
                    });
                    return;
                }

                const description = channels
                    .map(
                        (c, i) =>
                            `${i + 1}. **[${c.channelName}](https://www.youtube.com/channel/${c.channelId})** (\`${c.handle}\`) • Region: \`${c.region || "ID"}\``
                    )
                    .join("\n");

                const embed = new EmbedBuilder()
                    .setColor(YT_COLOR)
                    .setTitle("🎥 Monitored YouTube Channels")
                    .setThumbnail(YT_ICON)
                    .setDescription(description)
                    .setFooter({ text: `Total: ${channels.length}/${YT_MAX_CHANNELS_PER_GUILD} channels` });

                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case "enable": {
                const targetChannel = interaction.options.getChannel("channel", true) as TextChannel;

                const updated = await updateYouTubeFeedSettings(guildId, {
                    enabled: true,
                    channelId: targetChannel.id
                });
                const channelsCount = updated.youtubeFeed.youtubeChannels.length;

                const embed = new EmbedBuilder()
                    .setColor(YT_COLOR)
                    .setTitle("✅ YouTube Feed Enabled")
                    .setDescription(
                        `New video notifications from YouTube channels will be sent to <#${targetChannel.id}>`
                    )
                    .addFields({
                        name: "Monitored Channels",
                        value:
                            channelsCount > 0
                                ? `${channelsCount} channels (Use \`/youtube list\` to view)`
                                : "⚠️ No channels monitored yet. Use `/youtube add` to add one."
                    })
                    .setFooter({ text: "Feed will be updated periodically (every 1 minute)" });

                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case "disable": {
                await updateYouTubeFeedSettings(guildId, { enabled: false });

                await interaction.editReply({
                    content: "✅ YouTube feed notifications have been disabled."
                });
                break;
            }

            case "status": {
                const feed = settings.youtubeFeed;
                const channelList = feed?.youtubeChannels || [];

                const embed = new EmbedBuilder()
                    .setColor(feed?.enabled ? YT_COLOR : 0x808080)
                    .setTitle("🎥 YouTube Feed Status")
                    .setThumbnail(YT_ICON)
                    .addFields(
                        {
                            name: "Status",
                            value: feed?.enabled ? "✅ Enabled" : "❌ Disabled",
                            inline: true
                        },
                        {
                            name: "Discord Channel",
                            value: feed?.channelId ? `<#${feed.channelId}>` : "-",
                            inline: true
                        },
                        {
                            name: "Monitored Channels Count",
                            value: `${channelList.length}/${YT_MAX_CHANNELS_PER_GUILD}`,
                            inline: true
                        }
                    );

                if (channelList.length > 0) {
                    const sample = channelList
                        .slice(0, 5)
                        .map(c => `• **${c.channelName}** (\`${c.handle}\`)`)
                        .join("\n");
                    const extra = channelList.length > 5 ? `\n*...and ${channelList.length - 5} more channels*` : "";
                    embed.addFields({
                        name: "Channel List",
                        value: sample + extra
                    });
                }

                await interaction.editReply({ embeds: [embed] });
                break;
            }
        }
    } catch (error) {
        logger.error(error, "YouTube feed command failed");
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: "❌ An error occurred while processing the YouTube feed command."
            });
        } else {
            await interaction.reply({
                content: "❌ An error occurred while processing the YouTube feed command.",
                flags: MessageFlags.Ephemeral
            });
        }
    }
}
