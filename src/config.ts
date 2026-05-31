// ── Scheduler ────────────────────────────────────────────────────────────────

const rawHour = parseInt(process.env.CLAIM_HOUR ?? "0", 10);
const rawMinute = parseInt(process.env.CLAIM_MINUTE ?? "0", 10);

/** Validated claim hour in 0-23 range. Falls back to 0 on invalid input. */
const claimHour = !isNaN(rawHour) && rawHour >= 0 && rawHour <= 23 ? rawHour : 0;

/** Validated claim minute in 0-59 range. Falls back to 0 on invalid input. */
const claimMinute = !isNaN(rawMinute) && rawMinute >= 0 && rawMinute <= 59 ? rawMinute : 0;

// ── Config ───────────────────────────────────────────────────────────────────

export const config = {
    discord: {
        token: process.env.DISCORD_TOKEN || "",
        clientId: process.env.DISCORD_CLIENT_ID || ""
    },
    mongodb: {
        uri: process.env.MONGODB_URI || "mongodb://localhost:27017/autoclaim-bot"
    },
    scheduler: {
        hour: claimHour,
        minute: claimMinute
    },
    crunchyroll: {
        email: process.env.CR_EMAIL || "",
        password: process.env.CR_PASSWORD || ""
    },
    u2: {
        rssUrl: process.env.U2_RSS_URL || ""
    },
    amenzb: {
        apiKey: process.env.AMENZB_API_KEY || ""
    },
    security: {
        tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY || ""
    }
};

// Fail fast: encryption key is required for safe token storage.
if (!config.security.tokenEncryptionKey) {
    console.error(
        "[Config] FATAL: TOKEN_ENCRYPTION_KEY is not set.\n" +
        "  Generate one with: openssl rand -hex 32\n" +
        "  Then add it to your .env file."
    );
    process.exit(1);
}
