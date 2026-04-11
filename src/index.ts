import { ShardingManager } from "discord.js";
import { config } from "./config";
import path from "path";
import { logger } from "./core/logger";

const manager = new ShardingManager(path.join(import.meta.dir, "bot.ts"), {
    token: config.discord.token,
    totalShards: "auto",
    respawn: true
});

manager.on("shardCreate", shard => {
    logger.info(`✨ Launched shard ${shard.id}`);

    // Route RAMEN cross-shard IPC messages
    shard.on("message", message => {
        if (message && message._ramen_ipc) {
            manager.shards.forEach(s => {
                if (s.id !== shard.id) {
                    s.send(message).catch(err => {
                        logger.error(err, `Failed to relay RAMEN message to shard ${s.id}`);
                    });
                }
            });
        }
    });
});

manager.spawn();
