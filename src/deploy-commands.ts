import { REST, Routes } from 'discord.js';
import { config } from './config';
import { commandsData } from './commands';

const rest = new REST().setToken(config.discord.token);

async function deploy() {
    try {
        console.log(`🔄 Registering ${commandsData.length} slash commands...`);

        const data = await rest.put(
            Routes.applicationCommands(config.discord.clientId),
            { body: commandsData.map(cmd => cmd.toJSON()) }
        );

        console.log(`✅ Successfully registered ${(data as any[]).length} slash commands globally.`);
        console.log('Commands:', commandsData.map(cmd => `/${cmd.name}`).join(', '));
    } catch (error) {
        console.error('❌ Error registering commands:', error);
        process.exit(1);
    }
}

deploy();
