const word = "makan";
const url = `https://kbbi.kemdikbud.go.id/entri/${word}`;

console.log(`Fetching ${url}...`);

try {
    const response = await fetch(url, {
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        }
    });
    console.log(`Status: ${response.status}`);
    const text = await response.text();
    console.log(`Length: ${text.length}`);
} catch (error) {
    console.error("Fetch error:", error);
}
