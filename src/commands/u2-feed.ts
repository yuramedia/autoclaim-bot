/**
 * /u2-feed command
 * Configure U2 BDMV torrent feed notifications
 */

import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    TextChannel
} from "discord.js";
import { GuildSettings } from "../database/models/GuildSettings";
import type { IU2FeedSettings } from "../types/u2-feed";
import { U2_DEFAULT_FILTER } from "../constants/u2-feed";

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
                    .setDescription("Channel to post notifications in")
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
    .addSubcommand(sub => sub.setName("status").setDescription("Check U2 feed configuration status"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({
            content: "This command can only be used in a server.",
            ephemeral: true
        });
        return;
    }

    let settings = await GuildSettings.findOne({ guildId });
    if (!settings) {
        settings = new GuildSettings({ guildId });
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case "enable": {
            const channel = interaction.options.getChannel("channel", true) as TextChannel;
            const filter = interaction.options.getString("filter") || U2_DEFAULT_FILTER;

            // Validate regex
            try {
                new RegExp(filter, "i");
            } catch {
                await interaction.reply({
                    content: `❌ Invalid regex filter: \`${filter}\``,
                    ephemeral: true
                });
                return;
            }

            settings.u2Feed = {
                enabled: true,
                channelId: channel.id,
                filter
            } as IU2FeedSettings;
            await settings.save();

            await interaction.reply({
                content: `📦 U2 BDMV feed enabled in <#${channel.id}>\n**Filter:** \`${filter}\``,
                ephemeral: true
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

            await interaction.reply({
                content: "📦 U2 BDMV feed disabled.",
                ephemeral: true
            });
            break;
        }

        case "status": {
            const u2 = settings.u2Feed;
            if (!u2?.enabled) {
                await interaction.reply({
                    content: "📦 U2 feed is **disabled**.",
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: [
                        "📦 U2 feed is **enabled**",
                        `**Channel:** <#${u2.channelId}>`,
                        `**Filter:** \`${u2.filter || U2_DEFAULT_FILTER}\``
                    ].join("\n"),
                    ephemeral: true
                });
            }
            break;
        }
    }
}
