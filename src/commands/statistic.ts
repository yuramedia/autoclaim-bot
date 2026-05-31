/**
 * Statistic Command
 * Display detailed bot and system statistics
 */

import { SlashCommandBuilder, EmbedBuilder, ChatInputCommandInteraction, MessageFlags, version as djsVersion } from "discord.js";
import os from "os";
import { version as nodeVersion } from "process";
import { formatUptimeSeconds } from "../utils/time";

export const data = new SlashCommandBuilder()
    .setName("statistic")
    .setDescription("Displays detailed bot and system statistics");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const client = interaction.client;

    // Fetch application owner info if not already cached
    if (!client.application?.owner) await client.application?.fetch();
    const owner = client.application?.owner;

    // Determine if the caller is the bot owner.
    // client.application.owner is either a User (single owner) or a Team.
    const isOwner = owner
        ? "id" in owner
            ? owner.id === interaction.user.id                        // single User owner
            : Boolean((owner as any)?.members?.has?.(interaction.user.id)) // Team: any member
        : false;

    if (!isOwner) {
        await interaction.editReply({
            content: "❌ This command is restricted to the bot owner."
        });
        return;
    }

    // Get system stats
    const cpu = os.cpus()[0];
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsage = (usedMem / 1024 / 1024).toFixed(2);
    const osUptime = os.uptime();

    // Get bot stats (with sharding support)
    let totalGuilds = client.guilds.cache.size;
    let totalUsers = client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    let totalChannels = client.channels.cache.size;

    if (client.shard) {
        try {
            const results = await client.shard.broadcastEval(c => ({
                guilds: c.guilds.cache.size,
                users: c.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0),
                channels: c.channels.cache.size
            }));

            totalGuilds = results.reduce((acc, val) => acc + val.guilds, 0);
            totalUsers = results.reduce((acc, val) => acc + val.users, 0);
            totalChannels = results.reduce((acc, val) => acc + val.channels, 0);
        } catch (error) {
            console.error("[Statistic] Error fetching shard stats:", error);
        }
    }

    const embed = new EmbedBuilder()
        .setTitle(`${client.user?.username} Statistics`)
        .setColor(0x0099ff)
        .addFields(
            { name: "• Owner", value: owner?.toString() || "Unknown", inline: false },
            { name: "• Total Users", value: totalUsers.toLocaleString(), inline: true },
            { name: "• Total Guilds", value: totalGuilds.toLocaleString(), inline: true },
            { name: "• Total Channels", value: totalChannels.toLocaleString(), inline: true },
            { name: "• Total Shards", value: client.shard ? client.shard.count.toString() : "1", inline: true },
            { name: "• Uptime", value: formatUptimeSeconds(process.uptime()), inline: true },
            { name: "• Network Latency", value: `${client.ws.ping}ms`, inline: true },
            { name: "• Memory Usage", value: `${memUsage} MB`, inline: true },
            { name: "• CPU", value: `${os.cpus().length} cores - ${os.arch()}`, inline: true },
            { name: "• Model", value: cpu?.model || "Unknown", inline: false },
            { name: "• Free Memory", value: `${(freeMem / 1024 / 1024).toFixed(0)} MB`, inline: true },
            { name: "• Platform", value: `${os.platform()} ${os.release()}`, inline: true },
            { name: "• Node.js", value: nodeVersion, inline: true },
            { name: "• Discord.js", value: `v${djsVersion}`, inline: true },
            { name: "• OS Uptime", value: formatUptimeSeconds(osUptime), inline: true }
        )
        .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
}
