import { Client, GatewayIntentBits, DefaultWebSocketManagerOptions } from "discord.js";

// Override WS identify properties for Mobile Status
(DefaultWebSocketManagerOptions.identifyProperties as { browser?: string }).browser = "Discord iOS";

/**
 * The global Discord client instance configured with necessary gateway intents
 * (Guilds, GuildMessages, MessageContent, GuildMembers).
 *
 * GuildMembers is a privileged intent required by the antihack system to
 * access member permissions and ban compromised accounts.
 */
export const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});
