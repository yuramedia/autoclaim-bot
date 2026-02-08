import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { searchKbbi } from "../services/kbbi";
import { KBBI_BASE_URL } from "../constants/kbbi";

export const data = new SlashCommandBuilder()
    .setName("kbbi")
    .setDescription("Cari definisi kata di Kamus Besar Bahasa Indonesia (KBBI)")
    .addStringOption(option => option.setName("kata").setDescription("Kata yang ingin dicari").setRequired(true));

export async function execute(interaction: any) {
    await interaction.deferReply();

    const word = interaction.options.getString("kata");

    try {
        const result = await searchKbbi(word);

        if (!result) {
            return interaction.editReply({
                content: `Kata **"${word}"** tidak ditemukan di KBBI.`
            });
        }

        const embed = new EmbedBuilder()
            .setColor("#00a2e8")
            .setTitle(result.lemma)
            .setURL(`${KBBI_BASE_URL}${encodeURIComponent(word)}`)
            .setAuthor({
                name: "KBBI Daring Kemendikdasmen",
                url: KBBI_BASE_URL
            })
            .setFooter({
                text: "Sumber: KBBI Daring Kemendikdasmen"
            })
            .setTimestamp();

        let description = "";

        if (result.otherDetails && result.otherDetails.length > 0) {
            description += `*${result.otherDetails.join("\n")}*\n\n`;
        }

        if (result.definitions.length > 0) {
            description += result.definitions.map((def, index) => `${index + 1}. ${def}`).join("\n");
        } else {
            description += "Tidak ada definisi ditemukan.";
        }

        if (result.synonyms && result.synonyms.length > 0) {
            const maxSynonyms = 15;
            const shownSynonyms = result.synonyms.slice(0, maxSynonyms);
            let synonymText = shownSynonyms.join(", ");
            if (result.synonyms.length > maxSynonyms) {
                synonymText += `, dan ${result.synonyms.length - maxSynonyms} lainnya...`;
            }
            description += `\n\n**Sinonim**: ${synonymText}`;
        }

        embed.setDescription(description);

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        console.error("KBBI Command Error:", error);
        await interaction.editReply({ content: "Terjadi kesalahan saat mencari kata di KBBI." });
    }
}
