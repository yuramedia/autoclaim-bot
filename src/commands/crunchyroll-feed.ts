/**
 * Crunchyroll Feed Command
 * Configure Crunchyroll new episode notifications per guild
 */

import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} from "discord.js";
import { getGuildSettings, type ICrunchyrollFeedSettings } from "../database/models/GuildSettings";

export const data = new SlashCommandBuilder()
    .setName("crunchyroll-feed")
    .setDescription("Konfigurasi notifikasi episode baru Crunchyroll")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub
            .setName("enable")
            .setDescription("Aktifkan notifikasi episode baru")
            .addChannelOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("Channel untuk mengirim notifikasi")
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText)
            )
    )
    .addSubcommand(sub => sub.setName("disable").setDescription("Nonaktifkan notifikasi episode baru"))
    .addSubcommand(sub => sub.setName("status").setDescription("Lihat status konfigurasi saat ini"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
        await interaction.reply({
            content: "❌ Perintah ini hanya bisa digunakan di server.",
            ephemeral: true
        });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    const subcommand = interaction.options.getSubcommand();
    const settings = await getGuildSettings(interaction.guildId);

    switch (subcommand) {
        case "enable": {
            const channel = interaction.options.getChannel("channel", true);

            settings.crunchyrollFeed = {
                enabled: true,
                channelId: channel.id
            } as ICrunchyrollFeedSettings;
            await settings.save();

            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(0xf47521)
                        .setTitle("✅ Crunchyroll Feed Aktif")
                        .setDescription(`Notifikasi episode baru akan dikirim ke <#${channel.id}>`)
                        .setFooter({ text: "Episode baru akan muncul dalam beberapa menit setelah rilis" })
                ]
            });
            break;
        }

        case "disable": {
            settings.crunchyrollFeed = {
                enabled: false,
                channelId: null
            } as ICrunchyrollFeedSettings;
            await settings.save();

            await interaction.editReply({
                content: "✅ Notifikasi Crunchyroll telah dinonaktifkan."
            });
            break;
        }

        case "status": {
            const feed = settings.crunchyrollFeed;
            const embed = new EmbedBuilder()
                .setColor(0xf47521)
                .setTitle("📺 Status Crunchyroll Feed")
                .addFields(
                    {
                        name: "Status",
                        value: feed?.enabled ? "✅ Aktif" : "❌ Nonaktif",
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
}
