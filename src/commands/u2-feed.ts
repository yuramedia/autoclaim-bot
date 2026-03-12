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
    EmbedBuilder
} from "discord.js";
import { getGuildSettings } from "../database/models/GuildSettings";
import type { IU2FeedSettings } from "../types/u2-feed";
import { U2_DEFAULT_FILTER } from "../constants/u2-feed";

export const data = new SlashCommandBuilder()
    .setName("u2-feed")
    .setDescription("Konfigurasi notifikasi feed torrent U2 BDMV")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub
            .setName("enable")
            .setDescription("Aktifkan notifikasi feed U2 BDMV")
            .addChannelOption(option =>
                option
                    .setName("channel")
                    .setDescription("Channel untuk mengirim notifikasi")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName("filter")
                    .setDescription(`Filter regex untuk judul (default: ${U2_DEFAULT_FILTER})`)
                    .setRequired(false)
            )
    )
    .addSubcommand(sub => sub.setName("disable").setDescription("Nonaktifkan notifikasi feed U2 BDMV"))
    .addSubcommand(sub => sub.setName("status").setDescription("Lihat status konfigurasi feed U2 saat ini"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const guildId = interaction.guildId;
    if (!guildId) {
        await interaction.reply({
            content: "❌ Perintah ini hanya bisa digunakan di server.",
            ephemeral: true
        });
        return;
    }

    try {
        await interaction.deferReply({ ephemeral: true });

        const settings = await getGuildSettings(guildId);
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case "enable": {
                const channel = interaction.options.getChannel("channel", true) as TextChannel;
                const filter = interaction.options.getString("filter") || U2_DEFAULT_FILTER;

                // Validate regex
                try {
                    const _re = new RegExp(filter, "i"); // validate only
                } catch {
                    await interaction.editReply({
                        content: `❌ Filter regex tidak valid: \`${filter}\``
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
                            .setTitle("✅ U2 BDMV Feed Aktif")
                            .setDescription(`Notifikasi feed akan dikirim ke <#${channel.id}>`)
                            .addFields({ name: "Filter Regex", value: `\`${filter}\`` })
                            .setFooter({ text: "Feed akan diperbarui secara berkala" })
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
                    content: "✅ Notifikasi U2 BDMV feed telah dinonaktifkan."
                });
                break;
            }

            case "status": {
                const feed = settings.u2Feed;
                const embed = new EmbedBuilder()
                    .setColor(feed?.enabled ? 0x00ff00 : 0xff0000)
                    .setTitle("📦 Status U2 Feed")
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
        console.error("U2 feed command failed:", error);
        const reply = (interaction.deferred ? interaction.editReply : interaction.reply) as any;
        await reply.call(interaction, {
            content: "❌ Terjadi kesalahan saat memproses perintah.",
            ephemeral: true
        });
    }
}
