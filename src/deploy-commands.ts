import { REST, Routes } from "discord.js";
import { config } from "./config";
import { commandsData } from "./commands";
import { logger } from "./core/logger";

const rest = new REST().setToken(config.discord.token);

async function deploy() {
    try {
        logger.info(`🔄 Registering ${commandsData.length} slash commands...`);

        const data = await rest.put(Routes.applicationCommands(config.discord.clientId), {
            body: commandsData.map(cmd => cmd.toJSON())
        });

        logger.info(`✅ Successfully registered ${(data as any[]).length} slash commands globally.`);
        logger.info(`Commands: ${commandsData.map(cmd => `/${cmd.name}`).join(", ")}`);
    } catch (error) {
        logger.error(error, "❌ Error registering commands");
        process.exit(1);
    }
}

deploy();
