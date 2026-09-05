import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from "discord.js";
import { searchKbbi } from "../services/kbbi";
import { KBBI_BASE_URL } from "../constants/kbbi";
import { logger } from "../core/logger";

/**
 * Slash command data for the kbbi command.
 */
export const data = new SlashCommandBuilder()
    .setName("kbbi")
    .setDescription("Search word definitions in KBBI (Great Dictionary of the Indonesian Language)")
    .addStringOption(option => option.setName("kata").setDescription("Word to search for").setRequired(true));

/**
 * Executes the kbbi command to search Indonesian definitions in KBBI.
 *
 * @param interaction Chat input command interaction.
 * @returns A promise that resolves when the command finishes.
 */
export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply();

    const word = interaction.options.getString("kata", true);

    try {
        const result = await searchKbbi(word);

        if (!result) {
            await interaction.editReply({
                content: `Word **"${word}"** was not found in KBBI.`
            });
            return;
        }

        const embed = new EmbedBuilder()
            .setColor("#00a2e8")
            .setTitle(result.lemma)
            .setURL(`${KBBI_BASE_URL}${encodeURIComponent(word)}`)
            .setAuthor({
                name: "KBBI Daring Kemendikdasmen",
                url: KBBI_BASE_URL
            })
            .setTimestamp()
            .setThumbnail("https://kbbi.kemendikdasmen.go.id/Content/Images/logo%20tut%20wuri%20badan.png");

        let description = "";

        if (result.otherDetails && result.otherDetails.length > 0) {
            description += `*${result.otherDetails.join("\n")}*\n\n`;
        }

        if (result.definitions.length > 0) {
            description += result.definitions.map((def, index) => `${index + 1}. ${def}`).join("\n");
        } else {
            description += "No definition found.";
        }

        if (result.synonyms && result.synonyms.length > 0) {
            const listFormatter = new Intl.ListFormat("id", { style: "long", type: "conjunction" });
            description += "\n";
            result.synonyms.forEach(group => {
                const maxSynonyms = 15;
                const shownSynonyms = group.words.slice(0, maxSynonyms);
                let synonymText =
                    shownSynonyms.length > 1 ? listFormatter.format(shownSynonyms) : shownSynonyms.join("");
                if (group.words.length > maxSynonyms) {
                    const remainingCount = group.words.length - maxSynonyms;
                    const linkText = `dan ${remainingCount} lainnya`;
                    if (result.thesaurusUrl) {
                        synonymText += ` [${linkText}](${result.thesaurusUrl})`;
                    } else {
                        synonymText += ` ${linkText}`;
                    }
                }
                description += `\n\n**${group.class}**: ${synonymText}`;
            });
        }

        embed.setDescription(description.length > 4096 ? description.slice(0, 4090) + "..." : description);

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error(error, "KBBI Command Error");
        await interaction.editReply({ content: "An error occurred while searching for the word in KBBI." });
    }
}
