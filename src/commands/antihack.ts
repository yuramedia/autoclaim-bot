/**
 * Antihack Command
 * Configure the antihack (trap channel) system for the guild.
 * Requires BanMembers permission.
 */

import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    EmbedBuilder,
    PermissionFlagsBits,
    ChannelType,
    MessageFlags
} from "discord.js";
import { getGuildSettings, updateAntihackSettings } from "../database/models/guild-settings";
import { ANTIHACK_INFO_EMBED_COLOR } from "../constants";
import { logger } from "../core/logger";

/**
 * Slash command data for the antihack command.
 */
export const data = new SlashCommandBuilder()
    .setName("antihack")
    .setDescription("Configure the antihack trap channel system")
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addSubcommand(sub => sub.setName("enable").setDescription("Enable the antihack system for this server"))
    .addSubcommand(sub => sub.setName("disable").setDescription("Disable the antihack system for this server"))
    .addSubcommand(sub =>
        sub
            .setName("add")
            .setDescription("Add a trap channel")
            .addChannelOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("The channel to use as a trap")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            )
    )
    .addSubcommand(sub =>
        sub
            .setName("remove")
            .setDescription("Remove a trap channel")
            .addChannelOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("The channel to remove from traps")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            )
    )
    .addSubcommand(sub =>
        sub
            .setName("log")
            .setDescription("Set the log channel for antihack ban events")
            .addChannelOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("The channel to log ban events to")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            )
    )
    .addSubcommand(sub => sub.setName("status").setDescription("Show current antihack settings"));

/**
 * Executes the antihack command to configure trap channel settings.
 * @param interaction - Chat input command interaction
 * @returns A promise that resolves when the command finishes
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        if (!interaction.guildId) {
            await interaction.reply({
                content: "❌ This command can only be used in a server.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const subcommand = interaction.options.getSubcommand();
        const settings = await getGuildSettings(interaction.guildId);

        switch (subcommand) {
            case "enable": {
                await updateAntihackSettings(interaction.guildId, { enabled: true });
                await interaction.editReply({
                    content: "🛡️ Antihack system has been **enabled** for this server."
                });
                break;
            }

            case "disable": {
                await updateAntihackSettings(interaction.guildId, { enabled: false });
                await interaction.editReply({
                    content: "❌ Antihack system has been **disabled** for this server."
                });
                break;
            }

            case "add": {
                const channel = interaction.options.getChannel("channel", true);
                const channelIds = [...settings.antihack.channelIds];

                if (channelIds.includes(channel.id)) {
                    await interaction.editReply({
                        content: `⚠️ <#${channel.id}> is already a trap channel.`
                    });
                    return;
                }

                channelIds.push(channel.id);
                await updateAntihackSettings(interaction.guildId, { channelIds });

                // Post a warning embed in the newly added trap channel and pin it
                const guildChannel = await interaction.guild?.channels.fetch(channel.id);
                if (guildChannel?.isTextBased()) {
                    const warnEmbed = new EmbedBuilder()
                        .setTitle("⚠️ Honeypot Channel")
                        .setDescription(
                            "This channel is part of the server's antihack protection system.\n\n" +
                                "**DO NOT SEND ANY MESSAGES HERE.**\n\n" +
                                "Any message sent here will result in an **automatic, permanent ban**."
                        )
                        .setColor(0xff5555)
                        .setTimestamp();

                    try {
                        const sentMessage = await guildChannel.send({ embeds: [warnEmbed] });
                        await sentMessage.pin().catch(() => {}); // ignore error if bot lacks pin permissions
                    } catch (err) {
                        logger.error(err, `Failed to send warning embed in channel ${channel.id}`);
                    }
                }

                await interaction.editReply({
                    content:
                        `🛡️ Added <#${channel.id}> as a trap channel.\n` +
                        `Anyone who sends a message there will be **banned** automatically.`
                });
                break;
            }

            case "remove": {
                const channel = interaction.options.getChannel("channel", true);
                const channelIds = settings.antihack.channelIds.filter(id => id !== channel.id);

                if (channelIds.length === settings.antihack.channelIds.length) {
                    await interaction.editReply({
                        content: `⚠️ <#${channel.id}> is not a trap channel.`
                    });
                    return;
                }

                await updateAntihackSettings(interaction.guildId, { channelIds });
                await interaction.editReply({
                    content: `✅ Removed <#${channel.id}> from trap channels.`
                });
                break;
            }

            case "log": {
                const channel = interaction.options.getChannel("channel", true);
                await updateAntihackSettings(interaction.guildId, { logChannelId: channel.id });
                await interaction.editReply({
                    content: `📋 Set <#${channel.id}> as the antihack log channel.`
                });
                break;
            }

            case "status": {
                const trapChannels =
                    settings.antihack.channelIds.length > 0
                        ? settings.antihack.channelIds.map(id => `<#${id}>`).join("\n")
                        : "*None configured*";

                const logChannel = settings.antihack.logChannelId
                    ? `<#${settings.antihack.logChannelId}>`
                    : "*Not set*";

                const embed = new EmbedBuilder()
                    .setTitle("🛡️ Antihack Settings")
                    .setColor(ANTIHACK_INFO_EMBED_COLOR)
                    .addFields(
                        {
                            name: "Status",
                            value: settings.antihack.enabled ? "✅ Enabled" : "❌ Disabled",
                            inline: true
                        },
                        {
                            name: "Log Channel",
                            value: logChannel,
                            inline: true
                        },
                        {
                            name: `Trap Channels (${settings.antihack.channelIds.length})`,
                            value: trapChannels
                        }
                    )
                    .setFooter({ text: "Users who post in trap channels will be banned automatically" })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
                break;
            }
        }
    } catch (error) {
        logger.error(error, "Antihack command failed");
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: "❌ An error occurred while updating antihack settings."
                });
            } else {
                await interaction.reply({
                    content: "❌ An error occurred while updating antihack settings.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (e) {
            logger.error(e, "Failed to send error reply");
        }
    }
}
