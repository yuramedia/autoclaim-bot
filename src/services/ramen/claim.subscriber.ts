import { client } from "../../core/client";
import { ramen } from "../../core/ramen";

export interface ClaimResultEvent {
    discordId: string;
    results: string[];
}

ramen.subscribe<ClaimResultEvent>("account:claim_result", async data => {
    const { discordId, results } = data;

    // We only try to DM the user if we are Shard 0 (or if not sharded)
    // because DMs are technically global to the bot, but can be sent from any shard.
    // Restricting to Shard 0 prevents duplicate sends if this event is broadcast cross-shard.
    // However, if the event origin is Shard 0 and it's sent locally, we only process it
    // locally to avoid unnecessary cross-shard broadcast for DMs.

    if (client.shard && client.shard.ids[0] !== 0) {
        return;
    }

    try {
        const discordUser = await client.users.fetch(discordId);
        await discordUser.send({
            embeds: [
                {
                    title: "📋 Daily Claim Results",
                    description: results.join("\n\n"),
                    color: 0x00ff00,
                    timestamp: new Date().toISOString()
                }
            ]
        });
    } catch {
        // User might have DMs disabled or bot is blocked
        console.warn(`[RAMEN] Could not DM user ${discordId} (might have DMs off)`);
    }
});

console.log("🍜 RAMEN Subscriber registered: account:claim_result");
