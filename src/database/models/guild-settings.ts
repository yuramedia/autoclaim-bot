/**
 * Guild Settings Model
 * Stores per-guild configuration for embed fix and other features
 */

import mongoose, { Schema, Document } from "mongoose";

import type { PlatformId } from "../../types/embed-fix";

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
 * Document interface representing guild-specific configuration settings stored in MongoDB.
 */
export interface IGuildSettings extends Document {
    guildId: string;
    embedFix: IEmbedFixSettings;
    crunchyrollFeed: ICrunchyrollFeedSettings;
    u2Feed: IU2FeedSettings;
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

const GuildSettingsSchema = new Schema<IGuildSettings>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        embedFix: { type: EmbedFixSettingsSchema, default: () => ({}) },
        crunchyrollFeed: { type: CrunchyrollFeedSettingsSchema, default: () => ({}) },
        u2Feed: { type: U2FeedSettingsSchema, default: () => ({}) }
    },
    {
        timestamps: true
    }
);

/**
 * Mongoose model for GuildSettings documents.
 */
export const GuildSettings = mongoose.model<IGuildSettings>("GuildSettings", GuildSettingsSchema);

/**
 * Get guild settings, creating default if not exists
 */
export async function getGuildSettings(guildId: string): Promise<IGuildSettings> {
    try {
        let settings = await GuildSettings.findOne({ guildId });
        if (!settings) {
            settings = await GuildSettings.create({ guildId });
        }
        return settings;
    } catch (error: unknown) {
        console.error(`[getGuildSettings] Failed to fetch settings for guild ${guildId}:`, error);
        throw error;
    }
}

/**
 * Update guild embed fix settings
 */
export async function updateEmbedFixSettings(
    guildId: string,
    updates: Partial<IEmbedFixSettings>
): Promise<IGuildSettings> {
    try {
        const settings = await getGuildSettings(guildId);

        if (updates.enabled !== undefined) settings.embedFix.enabled = updates.enabled;
        if (updates.autoUpload !== undefined) settings.embedFix.autoUpload = updates.autoUpload;
        if (updates.richEmbeds !== undefined) settings.embedFix.richEmbeds = updates.richEmbeds;
        if (updates.disabledPlatforms !== undefined) settings.embedFix.disabledPlatforms = updates.disabledPlatforms;
        if (updates.deleteReaction !== undefined) settings.embedFix.deleteReaction = updates.deleteReaction;

        await settings.save();
        return settings;
    } catch (error: unknown) {
        console.error(`[updateEmbedFixSettings] Failed to update settings for guild ${guildId}:`, error);
        throw error;
    }
}
