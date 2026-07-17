import { EventEmitter } from "events";
import { Client } from "discord.js";
import { logger } from "../logger";

/**
 * Metadata sent alongside Ramen events.
 */
export interface RamenMetadata {
    isLocal: boolean;
    originShardId: number;
}

/**
 * Structure of messages sent via cross-shard IPC.
 */
interface RamenIpcMessage {
    _ramen_ipc?: boolean;
    topic: string;
    data: unknown;
    origin: number;
}

/**
 * Subscription handle returned by subscribe() for cleanup.
 */
export interface RamenSubscription {
    topic: string;
    handler: (data: unknown, meta: RamenMetadata) => void | Promise<void>;
}

/**
 * Event bus wrapper supporting cross-shard IPC in a Discord.js sharded setup.
 */
export class RamenBus {
    private emitter = new EventEmitter();
    private client: Client | null = null;
    private initialized = false;

    /**
     * Initializes the Ramen bus with the Discord client.
     * Hooks process IPC messages to forward events from other shards.
     * @param client - The active Discord client instance
     */
    public init(client: Client): void {
        if (this.initialized) return;
        this.client = client;
        this.initialized = true;

        if (this.client.shard) {
            // Listen for messages from the master process
            process.on("message", (message: unknown) => {
                const msg = message as RamenIpcMessage | null;
                if (msg && msg._ramen_ipc) {
                    // Skip events that originated from this shard —
                    // we already emitted them locally in publish().
                    // Without this filter, the master's cross-shard relay
                    // sends our own event back to us, causing double delivery.
                    if (msg.origin === this.shardId) return;

                    this.emitter.emit(msg.topic, msg.data, {
                        isLocal: false,
                        originShardId: msg.origin
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

    /**
     * Subscribes a handler to a specific event topic.
     * @param topic - The event channel/topic name
     * @param handler - Callback function invoked when the event is published
     * @returns A subscription handle that can be used to unsubscribe
     */
    public subscribe<T = unknown>(
        topic: string,
        handler: (data: T, meta: RamenMetadata) => void | Promise<void>
    ): RamenSubscription {
        // Wrap handler to handle the generic type
        const wrappedHandler = (data: unknown, meta: RamenMetadata) => handler(data as T, meta);
        this.emitter.on(topic, wrappedHandler);
        return { topic, handler: wrappedHandler };
    }

    /**
     * Unsubscribes a handler using the subscription handle.
     * @param subscription - The subscription handle returned by subscribe()
     */
    public unsubscribe(subscription: RamenSubscription): void {
        this.emitter.off(subscription.topic, subscription.handler);
    }

    /**
     * Removes all listeners for a specific topic.
     * @param topic - The event channel/topic name
     */
    public unsubscribeAll(topic: string): void {
        this.emitter.removeAllListeners(topic);
    }

    /**
     * Publishes an event to a topic, executing local handlers and sending the event
     * to all other active shards via process IPC.
     * @param topic - The event channel/topic name
     * @param data - The payload to send
     */
    public publish<T = unknown>(topic: string, data: T): void {
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
                    const errorObj = err instanceof Error ? err : new Error(String(err));
                    logger.error(errorObj, `RAMEN failed to send cross-shard message for topic ${topic}`);
                });
        }
    }
}

/**
 * Global instance of the Ramen event bus.
 */
export const ramen = new RamenBus();
