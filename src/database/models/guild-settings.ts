/**
 * Guild Settings Model
 * Stores per-guild configuration for embed fix and other features
 */

import mongoose, { Schema, Document } from "mongoose";

import type { PlatformId } from "../../types/embed-fix";
import { logger } from "../../core/logger";

/**
 * Settings configuration for the social media embed fixer.
 */
export interface IEmbedFixSettings {
    enabled: boolean;
    autoUpload: boolean;
    richEmbeds: boolean;
    disabledPlatforms: PlatformId[];
    deleteReaction: string;
}

/**
 * Settings configuration for the Crunchyroll release monitoring feed.
 */
export interface ICrunchyrollFeedSettings {
    enabled: boolean;
    channelId: string | null;
}

/**
 * Settings configuration for the U2 torrent release feed.
 */
export interface IU2FeedSettings {
    enabled: boolean;
    channelId: string | null;
    filter: string;
}

/**
 * Settings configuration for the antihack trap channel system.
 */
export interface IAntihackSettings {
    enabled: boolean;
    channelIds: string[];
    logChannelId: string | null;
}

/**
 * Settings configuration for individual YouTube channels subscribed to.
 */
export interface IYouTubeFeedChannel {
    channelId: string;
    channelName: string;
    handle: string;
    region?: string;
}

/**
 * Settings configuration for the YouTube channel release monitoring feed.
 */
export interface IYouTubeFeedSettings {
    enabled: boolean;
    channelId: string | null;
    youtubeChannels: IYouTubeFeedChannel[];
}

/**
 * Document interface representing guild-specific configuration settings stored in MongoDB.
 */
export interface IGuildSettings extends Document {
    guildId: string;
    embedFix: IEmbedFixSettings;
    crunchyrollFeed: ICrunchyrollFeedSettings;
    crunchyrollLineup: ICrunchyrollFeedSettings;
    u2Feed: IU2FeedSettings;
    antihack: IAntihackSettings;
    youtubeFeed: IYouTubeFeedSettings;
    createdAt: Date;
    updatedAt: Date;
}

const EmbedFixSettingsSchema = new Schema<IEmbedFixSettings>({
    enabled: { type: Boolean, default: true },
    autoUpload: { type: Boolean, default: true },
    richEmbeds: { type: Boolean, default: true },
    disabledPlatforms: { type: [String], default: [] },
    deleteReaction: { type: String, default: "❌" }
});

const CrunchyrollFeedSettingsSchema = new Schema<ICrunchyrollFeedSettings>({
    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: null }
});

const U2FeedSettingsSchema = new Schema<IU2FeedSettings>({
    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: null },
    filter: { type: String, default: "BDMV|Blu-ray|BD-BOX" }
});

const AntihackSettingsSchema = new Schema<IAntihackSettings>({
    enabled: { type: Boolean, default: false },
    channelIds: { type: [String], default: [] },
    logChannelId: { type: String, default: null }
});

const YouTubeFeedChannelSchema = new Schema<IYouTubeFeedChannel>({
    channelId: { type: String, required: true },
    channelName: { type: String, required: true },
    handle: { type: String, required: true },
    region: { type: String, default: "ID" }
});

const YouTubeFeedSettingsSchema = new Schema<IYouTubeFeedSettings>({
    enabled: { type: Boolean, default: false },
    channelId: { type: String, default: null },
    youtubeChannels: { type: [YouTubeFeedChannelSchema], default: [] }
});

const GuildSettingsSchema = new Schema<IGuildSettings>(
    {
        guildId: { type: String, required: true, unique: true },
        embedFix: { type: EmbedFixSettingsSchema, default: () => ({}) },
        crunchyrollFeed: { type: CrunchyrollFeedSettingsSchema, default: () => ({}) },
        crunchyrollLineup: { type: CrunchyrollFeedSettingsSchema, default: () => ({}) },
        u2Feed: { type: U2FeedSettingsSchema, default: () => ({}) },
        antihack: { type: AntihackSettingsSchema, default: () => ({}) },
        youtubeFeed: { type: YouTubeFeedSettingsSchema, default: () => ({}) }
    },
    {
        timestamps: true
    }
);

/**
 * Mongoose model for GuildSettings documents.
 */
export const GuildSettings = mongoose.model<IGuildSettings>("GuildSettings", GuildSettingsSchema);

// ── Read cache ──────────────────────────────────────────────────────────────
// The per-guild settings document is read on every guild message (embed fix +
// antihack). A short-TTL cache collapses that hot path to one DB read per TTL
// window per guild; all mutating helpers invalidate explicitly.

/** Cache entry with expiry tracking. */
interface GuildSettingsCacheEntry {
    doc: IGuildSettings;
    expiresAt: number;
}

const guildSettingsCache = new Map<string, GuildSettingsCacheEntry>();
const GUILD_SETTINGS_CACHE_TTL_MS = 30_000;

/**
 * Remove a guild's cached settings so the next read hits the database.
 * @param guildId - The guild whose cache entry should be dropped.
 */
export function invalidateGuildSettingsCache(guildId: string): void {
    guildSettingsCache.delete(guildId);
}

/**
 * Get guild settings, creating default if not exists.
 * Concurrent first-touch creates are tolerated: on a duplicate-key race the
 * winner's document is re-read instead of throwing E11000.
 *
 * @param guildId - The Discord guild ID.
 * @returns The guild settings document.
 */
export async function getGuildSettings(guildId: string): Promise<IGuildSettings> {
    try {
        let settings = await GuildSettings.findOne({ guildId });
        if (!settings) {
            try {
                settings = await GuildSettings.create({ guildId });
            } catch (createError) {
                // Lost a concurrent create race — re-read the winning document
                if ((createError as { code?: number }).code === 11000) {
                    settings = await GuildSettings.findOne({ guildId });
                } else {
                    throw createError;
                }
            }
        }
        if (!settings) {
            throw new Error(`GuildSettings for guild ${guildId} disappeared during get-or-create`);
        }
        return settings;
    } catch (error: unknown) {
        logger.error(error, `[getGuildSettings] Failed to fetch settings for guild ${guildId}`);
        throw error;
    }
}

/**
 * Get guild settings through a 30s read-through cache.
 * Returns a cloned object so in-memory mutations never bleed across calls.
 *
 * @param guildId - The Discord guild ID.
 * @returns The guild settings object.
 */
export async function getCachedGuildSettings(guildId: string): Promise<IGuildSettings> {
    const now = Date.now();
    const cached = guildSettingsCache.get(guildId);
    if (cached && now < cached.expiresAt) {
        return structuredClone(cached.doc);
    }

    // Prune expired entries opportunistically to keep the map bounded
    if (guildSettingsCache.size > 1000) {
        for (const [key, entry] of guildSettingsCache) {
            if (now >= entry.expiresAt) guildSettingsCache.delete(key);
        }
        // If still above limit after pruning expired, evict oldest entries (LRU)
        while (guildSettingsCache.size > 1000) {
            const oldestKey = guildSettingsCache.keys().next().value;
            if (oldestKey) guildSettingsCache.delete(oldestKey);
            else break;
        }
    }

    const doc = await getGuildSettings(guildId);
    const plainDoc = (doc && typeof doc.toObject === "function" ? doc.toObject() : doc) as IGuildSettings;
    guildSettingsCache.set(guildId, { doc: plainDoc, expiresAt: Date.now() + GUILD_SETTINGS_CACHE_TTL_MS });
    return structuredClone(plainDoc);
}

/**
 * Update guild embed fix settings atomically via dot-path $set.
 */
export async function updateEmbedFixSettings(
    guildId: string,
    updates: Partial<IEmbedFixSettings>
): Promise<IGuildSettings> {
    try {
        const $set: Record<string, unknown> = {};
        if (updates.enabled !== undefined) $set["embedFix.enabled"] = updates.enabled;
        if (updates.autoUpload !== undefined) $set["embedFix.autoUpload"] = updates.autoUpload;
        if (updates.richEmbeds !== undefined) $set["embedFix.richEmbeds"] = updates.richEmbeds;
        if (updates.disabledPlatforms !== undefined) $set["embedFix.disabledPlatforms"] = updates.disabledPlatforms;
        if (updates.deleteReaction !== undefined) $set["embedFix.deleteReaction"] = updates.deleteReaction;

        const settings = await GuildSettings.findOneAndUpdate({ guildId }, { $set }, { new: true, upsert: true });
        invalidateGuildSettingsCache(guildId);
        return settings!;
    } catch (error: unknown) {
        logger.error(error, `[updateEmbedFixSettings] Failed to update settings for guild ${guildId}`);
        throw error;
    }
}

/**
 * Update guild antihack settings atomically via dot-path $set.
 *
 * @param guildId - The guild ID to update settings for
 * @param updates - Partial antihack settings to apply
 * @returns The updated guild settings document
 */
export async function updateAntihackSettings(
    guildId: string,
    updates: Partial<IAntihackSettings>
): Promise<IGuildSettings> {
    try {
        const $set: Record<string, unknown> = {};
        if (updates.enabled !== undefined) $set["antihack.enabled"] = updates.enabled;
        if (updates.channelIds !== undefined) $set["antihack.channelIds"] = updates.channelIds;
        if (updates.logChannelId !== undefined) $set["antihack.logChannelId"] = updates.logChannelId;

        const settings = await GuildSettings.findOneAndUpdate({ guildId }, { $set }, { new: true, upsert: true });
        invalidateGuildSettingsCache(guildId);
        return settings!;
    } catch (error: unknown) {
        logger.error(error, `[updateAntihackSettings] Failed to update settings for guild ${guildId}`);
        throw error;
    }
}

/**
 * Update guild U2 feed settings atomically via dot-path $set.
 *
 * @param guildId - The guild ID to update settings for
 * @param updates - Partial U2 feed settings to apply
 * @returns The updated guild settings document
 */
export async function updateU2FeedSettings(
    guildId: string,
    updates: Partial<IU2FeedSettings>
): Promise<IGuildSettings> {
    try {
        const $set: Record<string, unknown> = {};
        if (updates.enabled !== undefined) $set["u2Feed.enabled"] = updates.enabled;
        if (updates.channelId !== undefined) $set["u2Feed.channelId"] = updates.channelId;
        if (updates.filter !== undefined) $set["u2Feed.filter"] = updates.filter;

        const settings = await GuildSettings.findOneAndUpdate({ guildId }, { $set }, { new: true, upsert: true });
        invalidateGuildSettingsCache(guildId);
        return settings!;
    } catch (error: unknown) {
        logger.error(error, `[updateU2FeedSettings] Failed to update settings for guild ${guildId}`);
        throw error;
    }
}

/**
 * Update a Crunchyroll feed section (episode feed or seasonal lineup) atomically
 * via dot-path $set.
 *
 * @param guildId - The guild ID to update settings for
 * @param section - Which Crunchyroll feed section to update
 * @param updates - Partial feed settings to apply
 * @returns The updated guild settings document
 */
export async function updateCrunchyrollFeedSettings(
    guildId: string,
    section: "crunchyrollFeed" | "crunchyrollLineup",
    updates: Partial<ICrunchyrollFeedSettings>
): Promise<IGuildSettings> {
    try {
        const $set: Record<string, unknown> = {};
        if (updates.enabled !== undefined) $set[`${section}.enabled`] = updates.enabled;
        if (updates.channelId !== undefined) $set[`${section}.channelId`] = updates.channelId;

        const settings = await GuildSettings.findOneAndUpdate({ guildId }, { $set }, { new: true, upsert: true });
        invalidateGuildSettingsCache(guildId);
        return settings!;
    } catch (error: unknown) {
        logger.error(error, `[updateCrunchyrollFeedSettings] Failed to update ${section} for guild ${guildId}`);
        throw error;
    }
}

/**
 * Update guild YouTube feed settings atomically via dot-path $set.
 * The channel list is written as a single atomic array replacement.
 *
 * @param guildId - The guild ID to update settings for
 * @param updates - Partial YouTube feed settings to apply
 * @returns The updated guild settings document
 */
export async function updateYouTubeFeedSettings(
    guildId: string,
    updates: Partial<IYouTubeFeedSettings>
): Promise<IGuildSettings> {
    try {
        const $set: Record<string, unknown> = {};
        if (updates.enabled !== undefined) $set["youtubeFeed.enabled"] = updates.enabled;
        if (updates.channelId !== undefined) $set["youtubeFeed.channelId"] = updates.channelId;
        if (updates.youtubeChannels !== undefined) $set["youtubeFeed.youtubeChannels"] = updates.youtubeChannels;

        const settings = await GuildSettings.findOneAndUpdate({ guildId }, { $set }, { new: true, upsert: true });
        invalidateGuildSettingsCache(guildId);
        return settings!;
    } catch (error: unknown) {
        logger.error(error, `[updateYouTubeFeedSettings] Failed to update settings for guild ${guildId}`);
        throw error;
    }
}
