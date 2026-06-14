/**
 * Antihack Service
 * Core logic for detecting and banning compromised/hacked accounts
 * that post in designated trap channels.
 */

import { type Message, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { getGuildSettings, type IGuildSettings } from "../database/models/guild-settings";
import { ANTIHACK_BAN_DELETE_SECONDS, ANTIHACK_EMBED_COLOR, ANTIHACK_MAX_MESSAGE_LENGTH } from "../constants";
import { logger } from "../core/logger";
import type { AntihackBanResult, AntihackLogData } from "../types/antihack";

/**
 * Handles a message sent in a trap channel. Deletes the message,
 * bans the user (with 7 days of message deletion), and sends a
 * log embed to the configured log channel.
 *
 * Settings are fetched once and reused throughout the function to
 * avoid redundant DB calls (fixes #21).
 *
 * @param message - The Discord message that triggered the trap
 * @returns The result of the ban action, or null if not a trap channel
 */
export async function handleAntihackMessage(message: Message): Promise<AntihackBanResult | null> {
    // Skip bots
    if (message.author.bot) return null;

    // Skip webhooks
    if (message.webhookId) return null;

    // Skip DMs
    if (!message.guild) return null;

    const guildId = message.guild.id;

    // Fetch settings once and reuse throughout
    let settings: IGuildSettings;
    try {
        settings = await getGuildSettings(guildId);
    } catch {
        return null;
    }

    // Check if this channel is a trap channel (inline, no separate DB call)
    if (!settings.antihack.enabled || !settings.antihack.channelIds.includes(message.channel.id)) {
        return null;
    }

    const member = message.member;
    if (!member) return null;

    // Don't ban admins/mods who might be testing
    if (member.permissions.has(PermissionFlagsBits.BanMembers)) return null;

    const channelName = "name" in message.channel ? (message.channel.name as string) : message.channel.id;

    try {
        // Delete the offending message
        await message.delete().catch(() => {});

        // Ban the user with 7 days of message deletion
        await message.guild.members.ban(member, {
            reason: `[Antihack] Sent message in trap channel #${channelName}`,
            deleteMessageSeconds: ANTIHACK_BAN_DELETE_SECONDS
        });

        logger.info(`[Antihack] Banned ${message.author.tag} (${message.author.id}) in ${message.guild.name}`);

        // Send log embed — pass settings to avoid redundant DB call
        await sendLogEmbed(message, settings, {
            userTag: message.author.tag,
            userId: message.author.id,
            avatarUrl: message.author.displayAvatarURL(),
            channelId: message.channel.id,
            messageContent: message.content.slice(0, ANTIHACK_MAX_MESSAGE_LENGTH) || "*No text content*",
            guildName: message.guild.name
        });

        return {
            success: true,
            userId: message.author.id,
            userTag: message.author.tag,
            channelId: message.channel.id,
            messageContent: message.content.slice(0, ANTIHACK_MAX_MESSAGE_LENGTH)
        };
    } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(error, `[Antihack] Failed to ban ${message.author.tag} (${message.author.id})`);

        return {
            success: false,
            userId: message.author.id,
            userTag: message.author.tag,
            channelId: message.channel.id,
            messageContent: message.content.slice(0, ANTIHACK_MAX_MESSAGE_LENGTH),
            error: errorMsg
        };
    }
}

/**
 * Sends a log embed to the configured log channel for the guild.
 *
 * Uses channels.fetch() instead of channels.cache.get() to ensure
 * the log channel is always resolved, even after a bot restart
 * when the cache is cold (fixes #20).
 *
 * @param message - The original triggering message (used to access the guild)
 * @param settings - Guild settings (already fetched, avoids redundant DB call)
 * @param data - The log data to include in the embed
 */
async function sendLogEmbed(message: Message, settings: IGuildSettings, data: AntihackLogData): Promise<void> {
    if (!message.guild) return;

    const logChannelId = settings.antihack.logChannelId;
    if (!logChannelId) return;

    try {
        // Use fetch() instead of cache.get() to avoid cold-cache issues after restart
        const logChannel = await message.guild.channels.fetch(logChannelId).catch(() => null);

        if (!logChannel) {
            logger.warn(`[Antihack] Log channel ${logChannelId} not found in guild ${message.guild.id}, skipping log`);
            return;
        }

        if (!logChannel.isTextBased()) {
            logger.warn(`[Antihack] Log channel ${logChannelId} is not text-based, skipping log`);
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle("🛡️ Antihack Triggered")
            .setColor(ANTIHACK_EMBED_COLOR)
            .setDescription(
                `**User:** ${data.userTag} (\`${data.userId}\`)\n` +
                    `**Channel:** <#${data.channelId}>\n` +
                    `**Message:** ${data.messageContent}\n` +
                    `**Action:** Banned + deleted 7 days of messages`
            )
            .setThumbnail(data.avatarUrl)
            .setTimestamp();

        await logChannel.send({ embeds: [embed] });
    } catch (error: unknown) {
        logger.error(error, "[Antihack] Failed to send log embed");
    }
}
