import { Client, GatewayIntentBits, DefaultWebSocketManagerOptions } from "discord.js";

// Override WS identify properties for Mobile Status
(DefaultWebSocketManagerOptions.identifyProperties as any).browser = "Discord iOS";

// Create and export the global client instance
export const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});
