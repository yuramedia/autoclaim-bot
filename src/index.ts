import {
    Client,
    GatewayIntentBits,
    Events,
    Collection,
    ChatInputCommandInteraction,
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

            const reply = {
                content: '❌ An error occurred while executing this command.',
                ephemeral: true,
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
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

            const reply = {
                content: '❌ An error occurred while processing your input.',
                ephemeral: true,
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
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
