import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder } from "discord.js";
import speedTest from "@hola.org/speedtest-net";

export const data = new SlashCommandBuilder().setName("speedtest").setDescription("Check hosting server network speed");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const waitingEmbed = new EmbedBuilder()
        .setTitle("🌐 Speedtest")
        .setColor(0xffff00)
        .setDescription("The Speedtest is running, please wait a bit...")
        .setThumbnail(
            "https://store-images.s-microsoft.com/image/apps.52586.13510798887693184.740d7baf-50aa-4e26-adec-ae739ac12068.c9ef9495-f245-4367-872b-c5cc7b48841d"
        )
        .setImage("https://b.cdnst.net/images/share-logo.png")
        .setFooter({ text: "⏳ This takes approximately 30 seconds." });

    await interaction.reply({ embeds: [waitingEmbed] });

    try {
        const speed = await speedTest({ acceptLicense: true });

        const downloadMbps = (speed.download.bandwidth / 125000).toFixed(2);
        const uploadMbps = (speed.upload.bandwidth / 125000).toFixed(2);

        const finishEmbed = new EmbedBuilder()
            .setTitle(`🌐 ${interaction.client.user?.username} Speedtest`)
            .setColor(0x00ff00)
            .setDescription(
                [
                    `**ISP:** ${speed.isp}`,
                    `**Server:** ${speed.server.name} | ${speed.server.location}`,
                    `**Host:** ${speed.server.host}`,
                    `**Packet Loss:** ${speed.packetLoss ?? "N/A"}%`,
                    `**Bot Ping:** ${interaction.client.ws.ping}ms`
                ].join("\n")
            )
            .addFields(
                {
                    name: "📥 Download",
                    value: `\`${downloadMbps} Mbps\``,
                    inline: true
                },
                {
                    name: "📤 Upload",
                    value: `\`${uploadMbps} Mbps\``,
                    inline: true
                },
                {
                    name: "📊 Ping",
                    value: `\`${speed.ping.latency.toFixed(2)}ms\``,
                    inline: true
                },
                {
                    name: "🔗 Result",
                    value: `[View Full Result](${speed.result.url})`,
                    inline: false
                }
            )
            .setThumbnail(
                "https://store-images.s-microsoft.com/image/apps.52586.13510798887693184.740d7baf-50aa-4e26-adec-ae739ac12068.c9ef9495-f245-4367-872b-c5cc7b48841d"
            )
            .setImage(`${speed.result.url}.png`)
            .setFooter({ text: "Powered by speedtest.net" })
            .setTimestamp();

        await interaction.editReply({ embeds: [finishEmbed] });
    } catch (error) {
        console.error("Speedtest error:", error);

        const errorEmbed = new EmbedBuilder()
            .setTitle("❌ Speedtest Failed")
            .setColor(0xff0000)
            .setDescription(
                `An error occurred while running the Speedtest.\n\`\`\`${error instanceof Error ? error.message : String(error)}\`\`\``
            )
            .setFooter({ text: "Error occurred during the Speedtest." })
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}
