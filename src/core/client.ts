import { Client, GatewayIntentBits, DefaultWebSocketManagerOptions } from "discord.js";

// Override WS identify properties for Mobile Status
(DefaultWebSocketManagerOptions.identifyProperties as { browser?: string }).browser = "Discord iOS";

/**
 * The global Discord client instance configured with necessary gateway intents (Guilds, GuildMessages, MessageContent).
 */
export const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
