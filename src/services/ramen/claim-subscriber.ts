import { client } from "../../core/client";
import { ramen } from "../../core/ramen";
import { logger } from "../../core/logger";

/**
 * Event data interface for daily claim results sent over the event bus.
 */
export interface ClaimResultEvent {
    discordId: string;
    results: string[];
    /** True when at least one result indicates an expired/invalid token. */
    isTokenError?: boolean;
}

ramen.subscribe<ClaimResultEvent>("account:claim_result", async (data, meta): Promise<void> => {
    try {
        const { discordId, results, isTokenError } = data;

        // Only send DMs from Shard 0 AND only for events originating from Shard 0.
        // This prevents duplicate DMs in multi-shard deployments where Shard 0
        // receives both its own local events AND cross-shard relayed events.
        if (client.shard && client.shard.ids[0] !== 0) {
            return;
        }
        if (meta.originShardId !== 0) {
            return;
        }

        // Pick embed style based on whether this is a token-error alert
        const embedColor = isTokenError ? 0xff4444 : 0x00ff00;
        const embedTitle = isTokenError ? "⚠️ Token Error — Action Required" : "📋 Daily Claim Results";
        const footer = isTokenError ? "Re-run /setup-hoyolab or /setup-endfield to update your token." : undefined;

        try {
            const discordUser = await client.users.fetch(discordId);
            const desc = results.join("\n\n");
            await discordUser.send({
                embeds: [
                    {
                        title: embedTitle,
                        description: desc.length > 4096 ? desc.slice(0, 4090) + "..." : desc,
                        color: embedColor,
                        timestamp: new Date().toISOString(),
                        ...(footer && { footer: { text: footer } })
                    }
                ]
            });
        } catch (error: unknown) {
            // User might have DMs disabled or the bot is blocked.
            const msg = error instanceof Error ? error.message : String(error);
            logger.warn(`[RAMEN] Could not DM user ${discordId} (DMs might be off). Reason: ${msg}`);
        }
    } catch (outerError: unknown) {
        const msg = outerError instanceof Error ? outerError.message : String(outerError);
        logger.error(`[RAMEN] Error in claim result subscriber: ${msg}`);
    }
});

logger.info("🍜 RAMEN Subscriber registered: account:claim_result");
