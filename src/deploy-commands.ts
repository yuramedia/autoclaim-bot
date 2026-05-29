import { REST, Routes } from "discord.js";
import { config } from "./config";
import { logger } from "./core/logger";
import { fetchCrunchyrollLanguages } from "./constants";

const rest = new REST().setToken(config.discord.token);

async function deploy() {
    try {
        // Fetch Crunchyroll languages first so slash commands have up-to-date choices
        logger.info("🌐 Fetching Crunchyroll languages...");
        await fetchCrunchyrollLanguages();

        // Dynamically import commands so the command data builder evaluates the updated LANG_MAP
        const { commandsData } = await import("./commands");

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
