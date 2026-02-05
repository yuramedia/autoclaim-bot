/**
 * Guild Settings Model
 * Stores per-guild configuration for embed fix and other features
 */

import mongoose, { Schema, Document } from "mongoose";

// Platform IDs for configuration (matches embed-fix.ts)
export type PlatformIdType =
    | "twitter"
    | "tiktok"
    | "reddit"
    | "instagram"
    | "pixiv"
    | "bluesky"
    | "threads"
    | "facebook"
    | "weibo"
    | "misskey"
    | "plurk";

export interface IEmbedFixSettings {
    enabled: boolean;
    autoUpload: boolean;
    richEmbeds: boolean;
    disabledPlatforms: PlatformIdType[];
    deleteReaction: string;
}

export interface ICrunchyrollFeedSettings {
    enabled: boolean;
    channelId: string | null;
}

export interface IGuildSettings extends Document {
    guildId: string;
    embedFix: IEmbedFixSettings;
    crunchyrollFeed: ICrunchyrollFeedSettings;
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

const GuildSettingsSchema = new Schema<IGuildSettings>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        embedFix: { type: EmbedFixSettingsSchema, default: () => ({}) },
        crunchyrollFeed: { type: CrunchyrollFeedSettingsSchema, default: () => ({}) }
    },
    {
        timestamps: true
    }
);

export const GuildSettings = mongoose.model<IGuildSettings>("GuildSettings", GuildSettingsSchema);

/**
 * Get guild settings, creating default if not exists
 */
export async function getGuildSettings(guildId: string): Promise<IGuildSettings> {
    let settings = await GuildSettings.findOne({ guildId });
    if (!settings) {
        settings = await GuildSettings.create({ guildId });
    }
    return settings;
}

/**
 * Update guild embed fix settings
 */
export async function updateEmbedFixSettings(
    guildId: string,
    updates: Partial<IEmbedFixSettings>
): Promise<IGuildSettings> {
    const settings = await getGuildSettings(guildId);

    if (updates.enabled !== undefined) settings.embedFix.enabled = updates.enabled;
    if (updates.autoUpload !== undefined) settings.embedFix.autoUpload = updates.autoUpload;
    if (updates.richEmbeds !== undefined) settings.embedFix.richEmbeds = updates.richEmbeds;
    if (updates.disabledPlatforms !== undefined) settings.embedFix.disabledPlatforms = updates.disabledPlatforms;
    if (updates.deleteReaction !== undefined) settings.embedFix.deleteReaction = updates.deleteReaction;

    await settings.save();
    return settings;
}
