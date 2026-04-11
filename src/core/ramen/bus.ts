import { EventEmitter } from "events";
import { Client } from "discord.js";
import { logger } from "../logger";

export interface RamenMetadata {
    isLocal: boolean;
    originShardId: number;
}

export class RamenBus {
    private emitter = new EventEmitter();
    private client: Client | null = null;
    private initialized = false;

    public init(client: Client) {
        if (this.initialized) return;
        this.client = client;
        this.initialized = true;

        if (this.client.shard) {
            // Listen for messages from the master process
            process.on("message", (message: any) => {
                if (message && message._ramen_ipc) {
                    this.emitter.emit(message.topic, message.data, {
                        isLocal: false,
                        originShardId: message.origin
                    });
                }
            });
            logger.info("🍜 RAMEN Bus initialized with cross-shard IPC support");
        } else {
            logger.info("🍜 RAMEN Bus initialized in local mode (no sharding)");
        }
    }

    private get shardId(): number {
        return this.client?.shard?.ids[0] ?? 0;
    }

    public subscribe<T = any>(topic: string, handler: (data: T, meta: RamenMetadata) => void | Promise<void>) {
        this.emitter.on(topic, handler);
    }

    public publish<T = any>(topic: string, data: T) {
        // Emit locally
        const targetListeners = this.emitter.listenerCount(topic);
        if (targetListeners > 0) {
            this.emitter.emit(topic, data, {
                isLocal: true,
                originShardId: this.shardId
            });
        }

        // Broadcast to other shards via discord.js IPC
        if (this.client?.shard) {
            this.client.shard
                .send({
                    _ramen_ipc: true,
                    topic,
                    data,
                    origin: this.shardId
                })
                .catch(err => {
                    logger.error(err, `RAMEN failed to send cross-shard message for topic ${topic}`);
                });
        }
    }
}

export const ramen = new RamenBus();
