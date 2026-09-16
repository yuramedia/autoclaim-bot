/**
 * Claim History Model
 * Stores execution history for automated and manual daily claims.
 * Uses a compound index for fast per-user retrieval and a 30-day TTL index
 * for automated maintenance and storage optimization.
 */

import mongoose, { Schema, Document } from "mongoose";
import { logger } from "../../core/logger";

/**
 * Interface representing a reward item granted during a daily claim.
 */
export interface IClaimReward {
    name: string;
    count: number;
    icon?: string;
}

/**
 * Payload interface for recording a new claim history entry.
 */
export interface IClaimHistoryInput {
    discordId: string;
    service: "hoyolab" | "endfield";
    game: string;
    success: boolean;
    message?: string;
    rewards?: IClaimReward[];
    claimedAt?: Date;
}

/**
 * Document interface representing a single claim event stored in MongoDB.
 */
export interface IClaimHistory extends Document {
    discordId: string;
    service: "hoyolab" | "endfield";
    game: string;
    success: boolean;
    message?: string;
    rewards: IClaimReward[];
    claimedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const ClaimRewardSchema = new Schema<IClaimReward>(
    {
        name: { type: String, required: true },
        count: { type: Number, required: true },
        icon: { type: String }
    },
    { _id: false }
);

const ClaimHistorySchema = new Schema<IClaimHistory>(
    {
        discordId: { type: String, required: true, index: true },
        service: { type: String, required: true, enum: ["hoyolab", "endfield"] },
        game: { type: String, required: true },
        success: { type: Boolean, required: true },
        message: { type: String },
        rewards: { type: [ClaimRewardSchema], default: [] },
        claimedAt: { type: Date, default: Date.now }
    },
    {
        timestamps: true
    }
);

// Compound index for chronological history queries per user
ClaimHistorySchema.index({ discordId: 1, claimedAt: -1 });

// TTL index: automatically purge claim logs older than 30 days
ClaimHistorySchema.index({ claimedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

/**
 * Mongoose model for ClaimHistory documents.
 */
export const ClaimHistory = mongoose.model<IClaimHistory>("ClaimHistory", ClaimHistorySchema);

/**
 * Records one or more claim results into the history log.
 *
 * @param entries - A single claim log entry or an array of entries.
 */
export async function recordClaimHistory(entries: IClaimHistoryInput | IClaimHistoryInput[]): Promise<void> {
    const list = Array.isArray(entries) ? entries : [entries];
    if (list.length === 0) return;

    try {
        await ClaimHistory.insertMany(list, { ordered: false });
    } catch (error) {
        logger.error(error, `[recordClaimHistory] Failed to record ${list.length} claim history entries`);
    }
}

/**
 * Fetches recent claim history records for a specific Discord user.
 *
 * @param discordId - The user's Discord ID.
 * @param limit - Maximum number of records to return (default 5).
 * @returns An array of plain claim history objects sorted most recent first.
 */
export async function getUserRecentClaimHistory(
    discordId: string,
    limit = 5
): Promise<Array<Omit<IClaimHistoryInput, "discordId"> & { claimedAt: Date }>> {
    try {
        const records = await ClaimHistory.find({ discordId })
            .sort({ claimedAt: -1 })
            .limit(limit)
            .select({ _id: 0, service: 1, game: 1, success: 1, message: 1, rewards: 1, claimedAt: 1 })
            .lean();

        return records as unknown as Array<Omit<IClaimHistoryInput, "discordId"> & { claimedAt: Date }>;
    } catch (error) {
        logger.error(error, `[getUserRecentClaimHistory] Failed to fetch claim history for ${discordId}`);
        return [];
    }
}

/**
 * Deletes all claim history records associated with a specific user.
 *
 * @param discordId - The user's Discord ID.
 * @returns The number of records deleted.
 */
export async function deleteUserClaimHistory(discordId: string): Promise<number> {
    try {
        const result = await ClaimHistory.deleteMany({ discordId });
        return result.deletedCount || 0;
    } catch (error) {
        logger.error(error, `[deleteUserClaimHistory] Failed to delete history for ${discordId}`);
        throw error;
    }
}
