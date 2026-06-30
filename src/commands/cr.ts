/**
 * Crunchyroll Commands
 * Configure Crunchyroll seasonal lineup announcements
 */

import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder,
    TextChannel
} from "discord.js";
import { getGuildSettings } from "../database/models/guild-settings";
import { CrunchyrollService } from "../services/crunchyroll";
import { CRUNCHYROLL_COLOR } from "../constants";
import { logger } from "../core/logger";

const service = new CrunchyrollService();

/**
 * Build a beautiful lineup announcement embed matching the screenshot styling
 */
export function buildLineupEmbed(announcement: {
    title: string;
    url: string;
    description: string;
    thumbnail: string | null;
    author: string | null;
    pubDate: string;
}): EmbedBuilder {
    const authorName = announcement.author || "Kyle Cardine";
    const embed = new EmbedBuilder()
        .setColor(CRUNCHYROLL_COLOR)
        .setAuthor({
            name: authorName,
            iconURL: "https://www.crunchyroll.com/favicons/favicon-32x32.png"
        })
        .setTitle(announcement.title)
        .setURL(announcement.url)
        .setDescription(announcement.description)
        .setTimestamp(new Date(announcement.pubDate))
        .setFooter({
            text: `Latest Anime News • ${announcement.url}`
        });

    if (announcement.thumbnail) {
        embed.setImage(announcement.thumbnail);
    }

    return embed;
}

export const data = new SlashCommandBuilder()
    .setName("cr")
    .setDescription("Crunchyroll commands")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommandGroup(group =>
        group
            .setName("lineup")
            .setDescription("Konfigurasi lineup Crunchyroll")
            .addSubcommand(sub =>
                sub
                    .setName("announcement")
                    .setDescription("Konfigurasi notifikasi pengumuman lineup seasonal")
                    .addStringOption(opt =>
                        opt
                            .setName("action")
                            .setDescription("Pilih aksi: enable, disable, atau status")
                            .setRequired(true)
                            .addChoices(
                                { name: "enable", value: "enable" },
                                { name: "disable", value: "disable" },
                                { name: "status", value: "status" }
                            )
                    )
                    .addChannelOption(opt =>
                        opt
                            .setName("channel")
                            .setDescription("Channel untuk mengirim notifikasi lineup (wajib untuk enable)")
                            .addChannelTypes(ChannelType.GuildText)
                    )
            )
    );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
        if (!interaction.guildId) {
            await interaction.reply({
                content: "❌ Perintah ini hanya bisa digunakan di server.",
                ephemeral: true
            });
            return;
        }

        await interaction.deferReply({ ephemeral: true });

        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        if (group === "lineup" && subcommand === "announcement") {
            const action = interaction.options.getString("action", true);
            const settings = await getGuildSettings(interaction.guildId);

            switch (action) {
                case "enable": {
                    const channel = interaction.options.getChannel("channel");
                    if (!channel) {
                        await interaction.editReply({
                            content: "❌ Anda harus menentukan channel untuk mengaktifkan notifikasi lineup."
                        });
                        return;
                    }

                    // Save settings
                    settings.crunchyrollLineup = {
                        enabled: true,
                        channelId: channel.id
                    };
                    await settings.save();

                    // Immediately fetch and send latest lineup announcement as a preview
                    const announcement = await service.fetchLatestLineupAnnouncement(true);
                    if (announcement) {
                        try {
                            const targetChannel = interaction.guild?.channels.cache.get(channel.id);
                            if (targetChannel && targetChannel instanceof TextChannel) {
                                const embed = buildLineupEmbed(announcement);
                                await targetChannel.send({ embeds: [embed] });
                            }
                        } catch (sendError) {
                            logger.error(sendError, `Failed to send preview lineup embed to channel ${channel.id}`);
                        }
                    }

                    await interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(CRUNCHYROLL_COLOR)
                                .setTitle("✅ Crunchyroll Lineup Announcement Aktif")
                                .setDescription(
                                    `Notifikasi pengumuman lineup seasonal telah aktif di <#${channel.id}>.`
                                )
                                .setFooter({ text: "Preview pengumuman lineup terbaru telah dikirim." })
                        ]
                    });
                    break;
                }

                case "disable": {
                    settings.crunchyrollLineup = {
                        enabled: false,
                        channelId: null
                    };
                    await settings.save();

                    await interaction.editReply({
                        content: "✅ Notifikasi pengumuman lineup Crunchyroll telah dinonaktifkan."
                    });
                    break;
                }

                case "status": {
                    const lineup = settings.crunchyrollLineup;
                    const embed = new EmbedBuilder()
                        .setColor(CRUNCHYROLL_COLOR)
                        .setTitle("📺 Status Crunchyroll Lineup Announcement")
                        .addFields(
                            {
                                name: "Status",
                                value: lineup?.enabled ? "✅ Aktif" : "❌ Nonaktif",
                                inline: true
                            },
                            {
                                name: "Channel",
                                value: lineup?.channelId ? `<#${lineup.channelId}>` : "-",
                                inline: true
                            }
                        );

                    await interaction.editReply({ embeds: [embed] });
                    break;
                }
            }
        }
    } catch (error) {
        logger.error(error, "Crunchyroll command execution failed");
        try {
            await interaction.editReply({
                content: "❌ Terjadi kesalahan saat memproses perintah Crunchyroll."
            });
        } catch (e) {
            logger.error(e, "Failed to send error reply");
        }
    }
}
