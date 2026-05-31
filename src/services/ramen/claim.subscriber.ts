import { client } from "../../core/client";
import { ramen } from "../../core/ramen";
import { logger } from "../../core/logger";

export interface ClaimResultEvent {
    discordId: string;
    results: string[];
    /** True when at least one result indicates an expired/invalid token. */
    isTokenError?: boolean;
}

ramen.subscribe<ClaimResultEvent>("account:claim_result", async data => {
    const { discordId, results, isTokenError } = data;

    // Only send DMs from Shard 0 to prevent duplicates in a sharded setup.
    if (client.shard && client.shard.ids[0] !== 0) {
        return;
    }

    // Pick embed style based on whether this is a token-error alert
    const embedColor = isTokenError ? 0xff4444 : 0x00ff00;
    const embedTitle = isTokenError ? "⚠️ Token Error — Action Required" : "📋 Daily Claim Results";
    const footer = isTokenError ? "Re-run /setup-hoyolab or /setup-endfield to update your token." : undefined;

    try {
        const discordUser = await client.users.fetch(discordId);
        await discordUser.send({
            embeds: [
                {
                    title: embedTitle,
                    description: results.join("\n\n"),
                    color: embedColor,
                    timestamp: new Date().toISOString(),
                    ...(footer && { footer: { text: footer } })
                }
            ]
        });
    } catch {
        // User might have DMs disabled or the bot is blocked.
        logger.warn(`[RAMEN] Could not DM user ${discordId} (DMs might be off).`);
    }
});

logger.info("🍜 RAMEN Subscriber registered: account:claim_result");
