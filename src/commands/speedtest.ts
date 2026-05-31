import { SlashCommandBuilder, type ChatInputCommandInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import { UniversalSpeedTest, SpeedUnits } from "universal-speedtest";
import { getCooldownRemaining, setCooldown, formatCooldown } from "../utils/cooldown";

const SPEEDTEST_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes per user

export const data = new SlashCommandBuilder().setName("speedtest").setDescription("Check hosting server network speed");

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    // Per-user cooldown — speedtest is resource-intensive (~30s, consumes bandwidth)
    const remaining = getCooldownRemaining("speedtest", interaction.user.id, SPEEDTEST_COOLDOWN_MS);
    if (remaining > 0) {
        await interaction.reply({
            content: `⏳ Please wait **${formatCooldown(remaining)}** before running another speedtest.`,
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const waitingEmbed = new EmbedBuilder()
        .setTitle("🌐 Speedtest")
        .setColor(0xffff00)
        .setDescription("The Speedtest is running, please wait a bit...")
        .setThumbnail(
            "https://store-images.s-microsoft.com/image/apps.52586.13510798887693184.740d7baf-50aa-4e26-adec-ae739ac12068.c9ef9495-f245-4367-872b-c5cc7b48841d"
        )
        .setImage("https://b.cdnst.net/images/share-logo.png")
        .setFooter({ text: "⏳ This takes approximately 30 seconds." });

    await interaction.deferReply();
    await interaction.editReply({ embeds: [waitingEmbed] });

    try {
        const speedTest = new UniversalSpeedTest({
            tests: {
                measureDownload: true,
                measureUpload: true
            },
            units: {
                downloadUnit: SpeedUnits.Mbps,
                uploadUnit: SpeedUnits.Mbps
            }
        });

        const result = await speedTest.performOoklaTest();

        // Stamp cooldown after a successful (expensive) run
        setCooldown("speedtest", interaction.user.id);

        const finishEmbed = new EmbedBuilder()
            .setTitle(`🌐 ${interaction.client.user?.username} Speedtest`)
            .setColor(0x00ff00)
            .setDescription(
                [
                    `**ISP:** ${result.client.isp}`,
                    `**Location:** ${result.client.country}`,
                    `**IP:** ${result.client.ip}`,
                    `**Server:** ${result.bestServer.name} (${result.bestServer.sponsor})`,
                    `**Server Location:** ${result.bestServer.country}`
                ].join("\n")
            )
            .addFields(
                {
                    name: "📥 Download",
                    value: `\`${result.downloadResult?.speed.toFixed(2) ?? "N/A"} Mbps\``,
                    inline: true
                },
                {
                    name: "📤 Upload",
                    value: `\`${result.uploadResult?.speed.toFixed(2) ?? "N/A"} Mbps\``,
                    inline: true
                },
                {
                    name: "📊 Bot Ping",
                    value: `\`${interaction.client.ws.ping}ms\``,
                    inline: true
                },
                {
                    name: "🔄 Latency",
                    value: `\`${result.pingResult.latency.toFixed(2)}ms\``,
                    inline: true
                },
                {
                    name: "📈 Jitter",
                    value: `\`${result.pingResult.jitter.toFixed(2)}ms\``,
                    inline: true
                },
                {
                    name: "⏱️ Test Duration",
                    value: `\`${result.totalTime.toFixed(2)}s\``,
                    inline: true
                }
            )
            .setThumbnail(
                "https://store-images.s-microsoft.com/image/apps.52586.13510798887693184.740d7baf-50aa-4e26-adec-ae739ac12068.c9ef9495-f245-4367-872b-c5cc7b48841d"
            )
            .setFooter({ text: "Powered by Ookla Speedtest" })
            .setTimestamp();

        // Add download details if available
        if (result.downloadResult) {
            finishEmbed.addFields({
                name: "📥 Download Details",
                value: [
                    `Transferred: \`${(result.downloadResult.transferredBytes / 1_000_000).toFixed(2)} MB\``,
                    `Latency: \`${result.downloadResult.latency.toFixed(2)}ms\``,
                    `Jitter: \`${result.downloadResult.jitter.toFixed(2)}ms\``
                ].join(" | "),
                inline: false
            });
        }

        // Add upload details if available
        if (result.uploadResult) {
            finishEmbed.addFields({
                name: "📤 Upload Details",
                value: [
                    `Transferred: \`${(result.uploadResult.transferredBytes / 1_000_000).toFixed(2)} MB\``,
                    `Latency: \`${result.uploadResult.latency.toFixed(2)}ms\``,
                    `Jitter: \`${result.uploadResult.jitter.toFixed(2)}ms\``
                ].join(" | "),
                inline: false
            });
        }

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
