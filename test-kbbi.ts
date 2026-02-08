import { searchKbbi } from "./src/services/kbbi";

const testWords = ["makan", "lari", "cinta", "komputer", "asjdhaskdhaskd"];

async function runTest() {
    console.log("Starting KBBI Scraper Test...");

    for (const word of testWords) {
        console.log(`\nTesting word: "${word}"`);
        const result = await searchKbbi(word);

        if (result) {
            console.log(`Found: ${result.lemma}`);
            console.log(`Link: https://kbbi.kemdikbud.go.id/entri/${word}`);
            if (result.definitions.length > 0) {
                console.log("Definitions:");
                result.definitions.forEach((def, i) => console.log(`  ${i + 1}. ${def}`));
            } else {
                console.log("No definitions found.");
            }
            if (result.tesaurusLink) {
                console.log(`Tesaurus: ${result.tesaurusLink}`);
            }
        } else {
            console.log("Result: NULL (Not found)");
        }
    }
}

runTest();
