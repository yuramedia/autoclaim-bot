import mongoose, { Schema, Document } from "mongoose";
import { logger } from "../../core/logger";

/**
 * Interface representing the Hoyolab daily auto-claim credentials and configuration data.
 */
export interface IHoyolabData {
    token: string;
    accountName: string;
    games: {
        genshin: boolean;
        starRail: boolean;
        honkai3: boolean;
        tearsOfThemis: boolean;
        zenlessZoneZero: boolean;
    };
    lastClaim?: Date;
    lastClaimResult?: string;
}

/**
 * Interface representing the Endfield daily auto-claim credentials and configuration data.
 */
export interface IEndfieldData {
    /** ACCOUNT_TOKEN from web-api.skport.com/cookie_store/account_token */
    accountToken: string;
    /** Display name */
    accountName: string;
    lastClaim?: Date;
    lastClaimResult?: string;
}

/**
 * Interface representing the core User document structure stored in MongoDB.
 */
export interface IUser extends Document {
    discordId: string;
    username: string;
    hoyolab?: IHoyolabData;
    endfield?: IEndfieldData;
    settings: {
        notifyOnClaim: boolean;
    };
    createdAt: Date;
    updatedAt: Date;
}

const HoyolabSchema = new Schema<IHoyolabData>(
    {
        token: { type: String, required: true },
        accountName: { type: String, default: "Unknown" },
        games: {
            genshin: { type: Boolean, default: false },
            starRail: { type: Boolean, default: false },
            honkai3: { type: Boolean, default: false },
            tearsOfThemis: { type: Boolean, default: false },
            zenlessZoneZero: { type: Boolean, default: false }
        },
        lastClaim: { type: Date },
        lastClaimResult: { type: String }
    },
    { _id: false }
);

const EndfieldSchema = new Schema<IEndfieldData>(
    {
        accountToken: { type: String, required: true },
        accountName: { type: String, default: "Unknown" },
        lastClaim: { type: Date },
        lastClaimResult: { type: String }
    },
    { _id: false }
);

const UserSchema = new Schema<IUser>(
    {
        discordId: { type: String, required: true, unique: true },
        username: { type: String, required: true },
        hoyolab: { type: HoyolabSchema },
        endfield: { type: EndfieldSchema },
        settings: {
            notifyOnClaim: { type: Boolean, default: true }
        }
    },
    {
        timestamps: true
    }
);

// Compound sparse indexes for daily claim processing and missed claim recovery
UserSchema.index({ "hoyolab.token": 1, "hoyolab.lastClaim": 1 }, { sparse: true });
UserSchema.index({ "endfield.accountToken": 1, "endfield.lastClaim": 1 }, { sparse: true });
UserSchema.index({ "settings.notifyOnClaim": 1 });

/**
 * The Mongoose model for User documents, providing access to Hoyolab and Endfield credentials.
 */
export const User = mongoose.model<IUser>("User", UserSchema);

// ── Repository Helpers ────────────────────────────────────────────────────────

/**
 * Retrieves a user document by Discord ID, with optional lean projection for read-only queries.
 *
 * @param discordId - The user's Discord ID.
 * @param options - Query options (e.g. lean: true).
 */
export async function getUser(discordId: string, options?: { lean?: boolean }): Promise<IUser | null> {
    try {
        const query = User.findOne({ discordId });
        if (options?.lean) {
            return (await query.lean()) as unknown as IUser;
        }
        return await query;
    } catch (error) {
        logger.error(error, `[getUser] Failed to find user ${discordId}`);
        throw error;
    }
}

/**
 * Finds an existing user or creates a new one with safe handling of concurrent insertion races.
 *
 * @param discordId - The user's Discord ID.
 * @param username - Discord username for profile attribution.
 */
export async function findOrCreateUser(discordId: string, username: string): Promise<IUser> {
    try {
        let user = await User.findOne({ discordId });
        if (!user) {
            try {
                user = await User.create({ discordId, username });
            } catch (createError) {
                // Lost a concurrent create race — re-read winning document
                if ((createError as { code?: number }).code === 11000) {
                    user = await User.findOne({ discordId });
                } else {
                    throw createError;
                }
            }
        }
        if (!user) {
            throw new Error(`User ${discordId} disappeared during findOrCreateUser`);
        }
        return user;
    } catch (error) {
        logger.error(error, `[findOrCreateUser] Failed for ${discordId}`);
        throw error;
    }
}

/**
 * Atomically updates Hoyolab credentials for a user.
 */
export async function updateHoyolabCredentials(
    discordId: string,
    data: {
        token: string;
        accountName?: string;
        games?: Partial<IHoyolabData["games"]>;
    },
    username?: string
): Promise<IUser> {
    try {
        const $set: Record<string, unknown> = {
            "hoyolab.token": data.token,
            "hoyolab.accountName": data.accountName || "Unknown"
        };
        if (username) {
            $set.username = username;
        }
        if (data.games) {
            for (const [game, enabled] of Object.entries(data.games)) {
                $set[`hoyolab.games.${game}`] = enabled;
            }
        }

        const user = await User.findOneAndUpdate(
            { discordId },
            {
                $set,
                $setOnInsert: {
                    settings: { notifyOnClaim: true },
                    "hoyolab.games": {
                        genshin: false,
                        starRail: false,
                        honkai3: false,
                        tearsOfThemis: false,
                        zenlessZoneZero: false
                    }
                }
            },
            { new: true, upsert: true }
        );

        return user!;
    } catch (error) {
        logger.error(error, `[updateHoyolabCredentials] Failed for user ${discordId}`);
        throw error;
    }
}

/**
 * Atomically updates Endfield credentials for a user.
 */
export async function updateEndfieldCredentials(
    discordId: string,
    data: {
        accountToken: string;
        accountName?: string;
    },
    username?: string
): Promise<IUser> {
    try {
        const $set: Record<string, unknown> = {
            "endfield.accountToken": data.accountToken,
            "endfield.accountName": data.accountName || "Unknown"
        };
        if (username) {
            $set.username = username;
        }

        const user = await User.findOneAndUpdate(
            { discordId },
            {
                $set,
                $setOnInsert: {
                    settings: { notifyOnClaim: true }
                }
            },
            { new: true, upsert: true }
        );

        return user!;
    } catch (error) {
        logger.error(error, `[updateEndfieldCredentials] Failed for user ${discordId}`);
        throw error;
    }
}

/**
 * Atomically updates which Hoyolab games are selected for daily claims.
 */
export async function updateHoyolabGames(discordId: string, games: Record<string, boolean>): Promise<IUser | null> {
    try {
        return await User.findOneAndUpdate({ discordId }, { $set: { "hoyolab.games": games } }, { new: true });
    } catch (error) {
        logger.error(error, `[updateHoyolabGames] Failed for user ${discordId}`);
        throw error;
    }
}

/**
 * Atomically updates the last claim timestamp and result summary for a service.
 */
export async function updateUserClaimResult(
    discordId: string,
    service: "hoyolab" | "endfield",
    result: string,
    timestamp: Date = new Date()
): Promise<void> {
    try {
        const update: Record<string, unknown> = {
            [`${service}.lastClaim`]: timestamp,
            [`${service}.lastClaimResult`]: result
        };
        await User.updateOne({ discordId }, { $set: update });
    } catch (error) {
        logger.error(error, `[updateUserClaimResult] Failed for user ${discordId} on ${service}`);
        throw error;
    }
}

/**
 * Updates user settings preferences (such as notifyOnClaim).
 */
export async function updateUserSettings(
    discordId: string,
    settings: { notifyOnClaim?: boolean },
    username?: string
): Promise<IUser | null> {
    try {
        const $set: Record<string, unknown> = {};
        if (username) $set.username = username;
        if (settings.notifyOnClaim !== undefined) {
            $set["settings.notifyOnClaim"] = settings.notifyOnClaim;
        }

        return await User.findOneAndUpdate({ discordId }, { $set }, { new: true, upsert: true });
    } catch (error) {
        logger.error(error, `[updateUserSettings] Failed for user ${discordId}`);
        throw error;
    }
}

/**
 * Deletes all user data from the database.
 */
export async function deleteUserData(discordId: string): Promise<boolean> {
    try {
        const result = await User.deleteOne({ discordId });
        return (result.deletedCount ?? 0) > 0;
    } catch (error) {
        logger.error(error, `[deleteUserData] Failed for user ${discordId}`);
        throw error;
    }
}

export const deleteUser = deleteUserData;

/**
 * Removes credentials and data for a specific service (Hoyolab or Endfield) from a user.
 */
export async function removeUserService(discordId: string, service: "hoyolab" | "endfield"): Promise<boolean> {
    try {
        const result = await User.updateOne({ discordId }, { $unset: { [service]: "" } });
        return (result.modifiedCount ?? 0) > 0;
    } catch (error) {
        logger.error(error, `[removeUserService] Failed for user ${discordId} on ${service}`);
        throw error;
    }
}
