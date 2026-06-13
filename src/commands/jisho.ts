import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { searchJisho } from "../services/jisho";
import { JISHO_COLOR, JISHO_ICON_URL } from "../constants/jisho";
import type { JishoWord } from "../types/jisho";
import { logger } from "../core/logger";

/**
 * Slash command data for the jisho command.
 */
export const data = new SlashCommandBuilder()
    .setName("jisho")
    .setDescription("Cari arti kata/kanji di kamus Jisho (Jepang-Inggris)")
    .addStringOption(option =>
        option.setName("kata").setDescription("Kata atau kanji yang ingin dicari").setRequired(true)
    );

/**
 * Executes the jisho command to search Japanese-English dictionary.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const keyword = interaction.options.getString("kata", true);

    try {
        const results = await searchJisho(keyword);

        if (!results || results.length === 0) {
            await interaction.editReply({
                content: `Tidak ditemukan hasil untuk kata **"${keyword}"**.`
            });
            return;
        }

        // Display the first result
        const firstResult = results[0];
        if (!firstResult) {
            await interaction.editReply({
                content: `Tidak ditemukan hasil untuk kata **"${keyword}"**.`
            });
            return;
        }
        const embed = createJishoEmbed(firstResult);

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error(error, "Jisho Command Error");
        await interaction.editReply({
            content: "Terjadi kesalahan saat mencari kata di Jisho."
        });
    }
}

function createJishoEmbed(result: JishoWord): EmbedBuilder {
    const embed = new EmbedBuilder().setColor(JISHO_COLOR);

    // Title / Author
    const title = result.word + (result.reading && result.reading !== result.word ? ` (${result.reading})` : "");
    embed.setAuthor({
        name: title,
        url: result.url,
        iconURL: JISHO_ICON_URL
    });

    let description = "";

    // Meanings
    if (result.meanings.length > 0) {
        description += "**Makna/Arti**\n";
        result.meanings.forEach((meaning, index) => {
            const num = index + 1;
            const parts = meaning.parts.length > 0 ? `*${meaning.parts.join(", ")}* ` : "";
            const defs = meaning.definitions.join("; ");

            description += `**${num}.** ${parts}${defs}\n`;

            if (meaning.info.length > 0) {
                description += `  Info: ${meaning.info.join("; ")}\n`;
            }
            if (meaning.seeAlso.length > 0) {
                description += `  Lihat juga: ${meaning.seeAlso.join(", ")}\n`;
            }
        });
        description += "\n";
    }

    // Other Forms
    if (result.otherForms.length > 0) {
        // Limit to 5 other forms to prevent embed bloat
        const formsToShow = result.otherForms.slice(0, 5);
        const formsText = formsToShow.map(f => `${f.word}${f.reading ? ` (${f.reading})` : ""}`).join("; ");

        description += `**Bentuk lain**: ${formsText}`;
        if (result.otherForms.length > 5) {
            description += `, ... (+${result.otherForms.length - 5})`;
        }
        description += "\n\n";
    }

    // JLPT & Tags
    const footerParts: string[] = [];
    if (result.jlpt.length > 0) {
        footerParts.push(...result.jlpt.map(s => s.toUpperCase().replace("-", " ")));
    }
    if (result.isCommon) {
        footerParts.push("Common Word");
    }

    footerParts.push("Menggunakan Jisho dan data JMDict");

    embed.setDescription(description);
    embed.setFooter({ text: footerParts.join(" | ") });

    return embed;
}
