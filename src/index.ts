import {
    Client,
    GatewayIntentBits,
    Events,
    Collection,
    type ChatInputCommandInteraction,
    MessageFlags,
} from 'discord.js';
import { config } from './config';
import { connectDatabase } from './database/connection';
import { commands } from './commands';
import { startScheduler } from './services/scheduler';
import { handleHoyolabModal } from './handlers/hoyolab-modal';
import { handleEndfieldModal } from './handlers/endfield-modal';

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
    ],
});

// Store commands in collection
const commandCollection = new Collection<string, typeof commands[0]>();
for (const command of commands) {
    commandCollection.set(command.data.name, command);
}

// Ready event
client.once(Events.ClientReady, (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}`);
    console.log(`📊 Serving ${readyClient.guilds.cache.size} guilds`);

    // Start scheduler
    startScheduler(client);

    // Update presence with UTC+8 time
    const updatePresence = () => {
        const now = new Date();
        const utc8 = new Date(now.getTime() + (8 * 60 * 60 * 1000));
        const timeStr = utc8.toISOString().substring(11, 16); // HH:MM

        readyClient.user.setActivity(`${timeStr} (UTC+8) | /help`, { type: 3 }); // Watching
    };

    updatePresence();
    setInterval(updatePresence, 60 * 1000); // Update every minute
});

// Interaction handler
client.on(Events.InteractionCreate, async (interaction) => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const command = commandCollection.get(interaction.commandName);

        if (!command) {
            console.error(`Command ${interaction.commandName} not found`);
            return;
        }

        try {
            await command.execute(interaction as ChatInputCommandInteraction);
        } catch (error) {
            console.error(`Error executing ${interaction.commandName}:`, error);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: '❌ An error occurred while executing this command.',
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while executing this command.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    }

    // Handle modal submissions
    if (interaction.isModalSubmit()) {
        try {
            if (interaction.customId === 'setup-hoyolab-modal') {
                await handleHoyolabModal(interaction);
            } else if (interaction.customId === 'setup-endfield-modal') {
                await handleEndfieldModal(interaction);
            }
        } catch (error) {
            console.error('Error handling modal:', error);

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: '❌ An error occurred while processing your input.',
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await interaction.reply({
                    content: '❌ An error occurred while processing your input.',
                    flags: MessageFlags.Ephemeral,
                });
            }
        }
    }
});

// Main function
async function main() {
    console.log('🚀 Starting Auto-Claim Bot...');

    // Connect to database
    await connectDatabase();

    // Login to Discord
    await client.login(config.discord.token);
}

// Handle errors
process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught exception:', error);
    process.exit(1);
});

// Start
main().catch(console.error);
