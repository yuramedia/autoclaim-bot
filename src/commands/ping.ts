import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    EmbedBuilder,
} from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check bot latency');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const sent = await interaction.reply({ content: '🏓 Pinging...', fetchReply: true });

    const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
    const wsLatency = interaction.client.ws.ping;

    const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor(wsLatency < 100 ? 0x00ff00 : wsLatency < 200 ? 0xffff00 : 0xff0000)
        .addFields(
            {
                name: '📡 Bot Latency',
                value: `\`${roundtrip}ms\``,
                inline: true,
            },
            {
                name: '💓 WebSocket',
                value: `\`${wsLatency}ms\``,
                inline: true,
            },
            {
                name: '📊 Uptime',
                value: `\`${formatUptime(interaction.client.uptime || 0)}\``,
                inline: true,
            }
        )
        .setTimestamp();

    await interaction.editReply({ content: '', embeds: [embed] });
}

function formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}
