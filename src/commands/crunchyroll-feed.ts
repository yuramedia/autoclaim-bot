/**
 * Crunchyroll Feed Command
 * Configure Crunchyroll new episode notifications per guild
 */

import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    MessageFlags
} from "discord.js";
import { getGuildSettings, updateCrunchyrollFeedSettings } from "../database/models/guild-settings";
import { logger } from "../core/logger";

/**
 * Slash command data for the crunchyroll-feed command.
 */
export const data = new SlashCommandBuilder()
    .setName("crunchyroll-feed")
    .setDescription("Configure Crunchyroll new episode notifications")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub
            .setName("enable")
            .setDescription("Enable new episode notifications")
            .addChannelOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("Channel to send notifications")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            )
    )
    .addSubcommand(sub => sub.setName("disable").setDescription("Disable new episode notifications"))
    .addSubcommand(sub => sub.setName("status").setDescription("View current configuration status"));

/**
 * Executes the crunchyroll-feed command to enable, disable, or check status of Crunchyroll feed notifications.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command is finished.
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

        const guildId = interaction.guildId;
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "enable": {
                const channel = interaction.options.getChannel("channel", true);

                await updateCrunchyrollFeedSettings(guildId, "crunchyrollFeed", {
                    enabled: true,
                    channelId: channel.id
                });

                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(0xf47521)
                            .setTitle("✅ Crunchyroll Feed Enabled")
                            .setDescription(`New episode notifications will be sent to <#${channel.id}>`)
                            .setFooter({ text: "New episodes will appear within a few minutes after release" })
                    ]
                });
                break;
            }

            case "disable": {
                await updateCrunchyrollFeedSettings(guildId, "crunchyrollFeed", {
                    enabled: false,
                    channelId: null
                });

                await interaction.editReply({
                    content: "✅ Crunchyroll notifications have been disabled."
                });
                break;
            }

            case "status": {
                const settings = await getGuildSettings(guildId);
                const feed = settings.crunchyrollFeed;
                const embed = new EmbedBuilder()
                    .setColor(0xf47521)
                    .setTitle("📺 Crunchyroll Feed Status")
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
                        }
                    );

                await interaction.editReply({ embeds: [embed] });
                break;
            }
        }
    } catch (error) {
        logger.error(error, "Crunchyroll feed command failed");
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({
                    content: "❌ An error occurred while processing the Crunchyroll feed command."
                });
            } else {
                await interaction.reply({
                    content: "❌ An error occurred while processing the Crunchyroll feed command.",
                    flags: MessageFlags.Ephemeral
                });
            }
        } catch (e) {
            logger.error(e, "Failed to send error reply");
        }
    }
}
