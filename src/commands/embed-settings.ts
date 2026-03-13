/**
 * Embed Settings Command
 * Configure embed fix feature for the guild
 */

import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getGuildSettings, updateEmbedFixSettings } from "../database/models/GuildSettings";
import { PLATFORMS } from "../constants";
import { PlatformId } from "../types";

export const data = new SlashCommandBuilder()
    .setName("embed-settings")
    .setDescription("Configure embed fix settings for this server")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(sub => sub.setName("enable").setDescription("Enable embed fix for this server"))
    .addSubcommand(sub => sub.setName("disable").setDescription("Disable embed fix for this server"))
    .addSubcommand(sub =>
        sub
            .setName("auto-upload")
            .setDescription("Toggle auto download and upload of media")
            .addBooleanOption(opt => opt.setName("enabled").setDescription("Enable auto upload").setRequired(true))
    )
    .addSubcommand(sub =>
        sub
            .setName("rich-embeds")
            .setDescription("Toggle rich embeds with author info and stats")
            .addBooleanOption(opt => opt.setName("enabled").setDescription("Enable rich embeds").setRequired(true))
    )
    .addSubcommand(sub =>
        sub
            .setName("platform")
            .setDescription("Enable or disable a specific platform")
            .addStringOption(opt =>
                opt
                    .setName("name")
                    .setDescription("Platform to toggle")
                    .setRequired(true)
                    .addChoices(...PLATFORMS.map(p => ({ name: p.name, value: p.id })))
            )
            .addBooleanOption(opt => opt.setName("enabled").setDescription("Enable this platform").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("status").setDescription("Show current embed fix settings"));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    if (!interaction.guildId) {
        await interaction.reply({
            content: "❌ This command can only be used in a server.",
            ephemeral: true
        });
        return;
    }

    const subcommand = interaction.options.getSubcommand();
    const settings = await getGuildSettings(interaction.guildId);

    switch (subcommand) {
        case "enable": {
            await updateEmbedFixSettings(interaction.guildId, { enabled: true });
            await interaction.reply({
                content: "✅ Embed fix has been **enabled** for this server.",
                ephemeral: true
            });
            break;
        }

        case "disable": {
            await updateEmbedFixSettings(interaction.guildId, { enabled: false });
            await interaction.reply({
                content: "❌ Embed fix has been **disabled** for this server.",
                ephemeral: true
            });
            break;
        }

        case "auto-upload": {
            const enabled = interaction.options.getBoolean("enabled", true);
            await updateEmbedFixSettings(interaction.guildId, { autoUpload: enabled });
            await interaction.reply({
                content: enabled
                    ? "✅ Auto upload has been **enabled**. Media under 10MB will be downloaded and uploaded to Discord."
                    : "❌ Auto upload has been **disabled**. Only embed fix links will be shown.",
                ephemeral: true
            });
            break;
        }

        case "rich-embeds": {
            const enabled = interaction.options.getBoolean("enabled", true);
            await updateEmbedFixSettings(interaction.guildId, { richEmbeds: enabled });
            await interaction.reply({
                content: enabled
                    ? "✅ Rich embeds have been **enabled**. Posts will show author info and engagement stats."
                    : "❌ Rich embeds have been **disabled**. Only embed fix links will be shown.",
                ephemeral: true
            });
            break;
        }

        case "platform": {
            const platformId = interaction.options.getString("name", true) as PlatformId;
            const enabled = interaction.options.getBoolean("enabled", true);
            const platform = PLATFORMS.find(p => p.id === platformId);

            if (!platform) {
                await interaction.reply({
                    content: "❌ Unknown platform.",
                    ephemeral: true
                });
                return;
            }

            const disabledPlatforms = [...settings.embedFix.disabledPlatforms];

            if (enabled) {
                // Remove from disabled list
                const index = disabledPlatforms.indexOf(platformId as PlatformId);
                if (index > -1) {
                    disabledPlatforms.splice(index, 1);
                }
            } else {
                // Add to disabled list
                if (!disabledPlatforms.includes(platformId as PlatformId)) {
                    disabledPlatforms.push(platformId as PlatformId);
                }
            }

            await updateEmbedFixSettings(interaction.guildId, { disabledPlatforms });
            await interaction.reply({
                content: enabled
                    ? `✅ **${platform.name}** embed fix has been **enabled**.`
                    : `❌ **${platform.name}** embed fix has been **disabled**.`,
                ephemeral: true
            });
            break;
        }

        case "status": {
            const embed = new EmbedBuilder()
                .setTitle("🔧 Embed Fix Settings")
                .setColor(0x5865f2)
                .addFields(
                    {
                        name: "Status",
                        value: settings.embedFix.enabled ? "✅ Enabled" : "❌ Disabled",
                        inline: true
                    },
                    {
                        name: "Auto Upload",
                        value: settings.embedFix.autoUpload ? "✅ Enabled" : "❌ Disabled",
                        inline: true
                    },
                    {
                        name: "Rich Embeds",
                        value: settings.embedFix.richEmbeds ? "✅ Enabled" : "❌ Disabled",
                        inline: true
                    }
                );

            // Show platforms status
            const platformStatus = PLATFORMS.map(p => {
                const disabled = settings.embedFix.disabledPlatforms.includes(p.id as PlatformId);
                return `${disabled ? "❌" : "✅"} ${p.name}`;
            }).join("\n");

            embed.addFields({
                name: "Platforms",
                value: platformStatus
            });

            await interaction.reply({ embeds: [embed], ephemeral: true });
            break;
        }
    }
}
