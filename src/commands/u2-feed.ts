/**
 * /u2-feed command
 * Configure U2 BDMV torrent feed notifications
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
import { getGuildSettings } from "../database/models/guild-settings";
import type { IU2FeedSettings } from "../types/u2-feed";
import { U2_DEFAULT_FILTER } from "../constants/u2-feed";
import { logger } from "../core/logger";

/**
 * Slash command data for the u2-feed command.
 */
export const data = new SlashCommandBuilder()
    .setName("u2-feed")
    .setDescription("Configure U2 BDMV torrent feed notifications")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub
            .setName("enable")
            .setDescription("Enable U2 BDMV feed notifications")
            .addChannelOption(option =>
                option
                    .setName("channel")
                    .setDescription("Channel to send notifications")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName("filter")
                    .setDescription(`Regex filter for titles (default: ${U2_DEFAULT_FILTER})`)
                    .setRequired(false)
            )
    )
    .addSubcommand(sub => sub.setName("disable").setDescription("Disable U2 BDMV feed notifications"))
    .addSubcommand(sub => sub.setName("status").setDescription("View current U2 feed configuration status"));

/**
 * Executes the u2-feed command to configure feed notifications.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
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

        switch (subcommand) {
            case "enable": {
                const channel = interaction.options.getChannel("channel", true) as TextChannel;
                const filter = interaction.options.getString("filter") || U2_DEFAULT_FILTER;

                // Validate regex
                try {
                    void new RegExp(filter, "i");
                } catch {
                    await interaction.editReply({
                        content: `❌ Invalid regex filter: \`${filter}\``
                    });
                    return;
                }

                settings.u2Feed = {
                    enabled: true,
                    channelId: channel.id,
                    filter
                } as IU2FeedSettings;
                await settings.save();

                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0x00ff00)
                            .setTitle("✅ U2 BDMV Feed Enabled")
                            .setDescription(`Feed notifications will be sent to <#${channel.id}>`)
                            .addFields({ name: "Filter Regex", value: `\`${filter}\`` })
                            .setFooter({ text: "Feed will be updated periodically" })
                    ]
                });
                break;
            }

            case "disable": {
                settings.u2Feed = {
                    enabled: false,
                    channelId: null,
                    filter: U2_DEFAULT_FILTER
                } as IU2FeedSettings;
                await settings.save();

                await interaction.editReply({
                    content: "✅ U2 BDMV feed notifications have been disabled."
                });
                break;
            }

            case "status": {
                const feed = settings.u2Feed;
                const embed = new EmbedBuilder()
                    .setColor(feed?.enabled ? 0x00ff00 : 0xff0000)
                    .setTitle("📦 U2 Feed Status")
                    .addFields(
                        {
                            name: "Status",
                            value: feed?.enabled ? "✅ Enabled" : "❌ Disabled",
                            inline: true
                        },
                        {
                            name: "Channel",
                            value: feed?.channelId ? `<#${feed.channelId}>` : "-",
                            inline: true
                        },
                        {
                            name: "Filter Regex",
                            value: `\`${feed?.filter || U2_DEFAULT_FILTER}\``,
                            inline: false
                        }
                    );

                await interaction.editReply({ embeds: [embed] });
                break;
            }
        }
    } catch (error) {
        logger.error(error, "U2 feed command failed");
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({
                content: "❌ An error occurred while processing the command."
            });
        } else {
            await interaction.reply({
                content: "❌ An error occurred while processing the command.",
                flags: MessageFlags.Ephemeral
            });
        }
    }
}
