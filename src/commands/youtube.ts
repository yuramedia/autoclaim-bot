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
    EmbedBuilder
} from "discord.js";
import { getGuildSettings } from "../database/models/guild-settings";
import { YouTubeFeedService } from "../services/youtube-feed";
import { YT_COLOR, YT_ICON, YT_MAX_CHANNELS_PER_GUILD } from "../constants/youtube-feed";
import { logger } from "../core/logger";

/**
 * Slash command data for the /youtube command.
 */
export const data = new SlashCommandBuilder()
    .setName("youtube")
    .setDescription("Konfigurasi notifikasi feed channel YouTube")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub =>
        sub
            .setName("add")
            .setDescription("Tambah channel YouTube untuk dipantau")
            .addStringOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("URL channel YouTube, handle (@username), atau ID channel")
                    .setRequired(true)
            )
            .addStringOption(opt =>
                opt
                    .setName("region")
                    .setDescription("Region / negara katalog YouTube (default: Indonesia ID)")
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
            .setDescription("Hapus channel YouTube dari daftar pantauan")
            .addStringOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("Handle (@username), ID channel, atau nama channel yang akan dihapus")
                    .setRequired(true)
            )
    )
    .addSubcommand(sub => sub.setName("list").setDescription("Lihat daftar channel YouTube yang sedang dipantau"))
    .addSubcommand(sub =>
        sub
            .setName("enable")
            .setDescription("Aktifkan notifikasi feed YouTube ke channel tertentu")
            .addChannelOption(opt =>
                opt
                    .setName("channel")
                    .setDescription("Channel Discord untuk menerima notifikasi")
                    .addChannelTypes(ChannelType.GuildText)
                    .setRequired(true)
            )
    )
    .addSubcommand(sub => sub.setName("disable").setDescription("Nonaktifkan notifikasi feed YouTube"))
    .addSubcommand(sub => sub.setName("status").setDescription("Lihat status konfigurasi feed YouTube saat ini"));

/**
 * Executes the /youtube command.
 * @param interaction Chat input command interaction.
 */
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
        const ytService = new YouTubeFeedService();

        switch (subcommand) {
            case "add": {
                const input = interaction.options.getString("channel", true);
                const region = interaction.options.getString("region") || "ID";
                const currentChannels = settings.youtubeFeed?.youtubeChannels || [];

                if (currentChannels.length >= YT_MAX_CHANNELS_PER_GUILD) {
                    await interaction.editReply({
                        content: `❌ Batas maksimum ${YT_MAX_CHANNELS_PER_GUILD} channel YouTube per server telah tercapai.`
                    });
                    return;
                }

                const resolved = await ytService.resolveChannelId(input);
                if (!resolved) {
                    await interaction.editReply({
                        content: `❌ Gagal menemukan channel YouTube untuk \`${input}\`. Pastikan URL, handle, atau ID channel valid.`
                    });
                    return;
                }

                const exists = currentChannels.some(c => c.channelId === resolved.channelId);
                if (exists) {
                    await interaction.editReply({
                        content: `⚠️ Channel YouTube **${resolved.channelName}** (\`${resolved.handle}\`) sudah ada dalam daftar pantauan.`
                    });
                    return;
                }

                settings.youtubeFeed.youtubeChannels.push({
                    channelId: resolved.channelId,
                    channelName: resolved.channelName,
                    handle: resolved.handle,
                    region
                });

                await settings.save();

                const embed = new EmbedBuilder()
                    .setColor(YT_COLOR)
                    .setTitle("✅ Channel YouTube Ditambahkan")
                    .setThumbnail(resolved.channelIcon || YT_ICON)
                    .addFields(
                        { name: "Nama Channel", value: resolved.channelName, inline: true },
                        { name: "Handle", value: resolved.handle, inline: true },
                        { name: "Channel ID", value: `\`${resolved.channelId}\``, inline: true },
                        { name: "Region Catalog", value: `\`${region}\``, inline: true }
                    )
                    .setFooter({
                        text: `Total channel dipantau: ${settings.youtubeFeed.youtubeChannels.length}/${YT_MAX_CHANNELS_PER_GUILD}`
                    });

                if (!settings.youtubeFeed.enabled || !settings.youtubeFeed.channelId) {
                    embed.setDescription(
                        "⚠️ **Catatan:** Notifikasi feed belum diaktifkan. Gunakan `/youtube enable` untuk memilih channel Discord."
                    );
                } else {
                    embed.setDescription(`Notifikasi video baru akan dikirim ke <#${settings.youtubeFeed.channelId}>`);
                }

                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case "remove": {
                const query = interaction.options.getString("channel", true).trim().toLowerCase();
                const currentChannels = settings.youtubeFeed?.youtubeChannels || [];

                if (currentChannels.length === 0) {
                    await interaction.editReply({
                        content: "❌ Belum ada channel YouTube yang ditambahkan di server ini."
                    });
                    return;
                }

                const cleanQuery = query.startsWith("@") ? query : `@${query}`;

                const index = currentChannels.findIndex(
                    c =>
                        c.channelId.toLowerCase() === query ||
                        c.handle.toLowerCase() === query ||
                        c.handle.toLowerCase() === cleanQuery ||
                        c.channelName.toLowerCase().includes(query)
                );

                if (index === -1) {
                    await interaction.editReply({
                        content: `❌ Channel YouTube \`${query}\` tidak ditemukan dalam daftar pantauan.`
                    });
                    return;
                }

                const removed = settings.youtubeFeed.youtubeChannels.splice(index, 1)[0];
                await settings.save();

                if (!removed) {
                    await interaction.editReply({
                        content: "❌ Gagal menghapus channel YouTube."
                    });
                    return;
                }

                await interaction.editReply({
                    content: `✅ Berhasil menghapus **${removed.channelName}** (\`${removed.handle}\`) dari daftar pantauan YouTube.`
                });
                break;
            }

            case "list": {
                const channels = settings.youtubeFeed?.youtubeChannels || [];

                if (channels.length === 0) {
                    await interaction.editReply({
                        content:
                            "ℹ️ Belum ada channel YouTube yang dipantau di server ini. Gunakan `/youtube add` untuk menambahkan."
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
                    .setTitle("🎥 Daftar Channel YouTube Dipantau")
                    .setThumbnail(YT_ICON)
                    .setDescription(description)
                    .setFooter({ text: `Total: ${channels.length}/${YT_MAX_CHANNELS_PER_GUILD} channel` });

                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case "enable": {
                const targetChannel = interaction.options.getChannel("channel", true) as TextChannel;
                const channelsCount = settings.youtubeFeed?.youtubeChannels?.length || 0;

                settings.youtubeFeed.enabled = true;
                settings.youtubeFeed.channelId = targetChannel.id;
                await settings.save();

                const embed = new EmbedBuilder()
                    .setColor(YT_COLOR)
                    .setTitle("✅ YouTube Feed Aktif")
                    .setDescription(`Notifikasi video baru dari channel YouTube akan dikirim ke <#${targetChannel.id}>`)
                    .addFields({
                        name: "Channel Dipantau",
                        value:
                            channelsCount > 0
                                ? `${channelsCount} channel (Gunakan \`/youtube list\` untuk melihat)`
                                : "⚠️ Belum ada channel dipantau. Gunakan `/youtube add` untuk menambahkan."
                    })
                    .setFooter({ text: "Feed akan diperbarui secara berkala (setiap 1 menit)" });

                await interaction.editReply({ embeds: [embed] });
                break;
            }

            case "disable": {
                settings.youtubeFeed.enabled = false;
                await settings.save();

                await interaction.editReply({
                    content: "✅ Notifikasi feed YouTube telah dinonaktifkan."
                });
                break;
            }

            case "status": {
                const feed = settings.youtubeFeed;
                const channelList = feed?.youtubeChannels || [];

                const embed = new EmbedBuilder()
                    .setColor(feed?.enabled ? YT_COLOR : 0x808080)
                    .setTitle("🎥 Status YouTube Feed")
                    .setThumbnail(YT_ICON)
                    .addFields(
                        {
                            name: "Status",
                            value: feed?.enabled ? "✅ Aktif" : "❌ Nonaktif",
                            inline: true
                        },
                        {
                            name: "Channel Discord",
                            value: feed?.channelId ? `<#${feed.channelId}>` : "-",
                            inline: true
                        },
                        {
                            name: "Jumlah Channel Dipantau",
                            value: `${channelList.length}/${YT_MAX_CHANNELS_PER_GUILD}`,
                            inline: true
                        }
                    );

                if (channelList.length > 0) {
                    const sample = channelList
                        .slice(0, 5)
                        .map(c => `• **${c.channelName}** (\`${c.handle}\`)`)
                        .join("\n");
                    const extra = channelList.length > 5 ? `\n*...dan ${channelList.length - 5} channel lainnya*` : "";
                    embed.addFields({
                        name: "Daftar Channel",
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
                content: "❌ Terjadi kesalahan saat memproses perintah YouTube feed."
            });
        } else {
            await interaction.reply({
                content: "❌ Terjadi kesalahan saat memproses perintah YouTube feed.",
                ephemeral: true
            });
        }
    }
}
