import mongoose, { Schema, Document } from "mongoose";

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

const HoyolabSchema = new Schema<IHoyolabData>({
    token: { type: String, required: true },
    accountName: { type: String, default: "Unknown" },
    games: {
        genshin: { type: Boolean, default: false },
        starRail: { type: Boolean, default: false },
        honkai3: { type: Boolean, default: false },
        tearsOfThemis: { type: Boolean, default: false },
        zenlessZoneZero: { type: Boolean, default: false }
    },
    lastClaim: { type: Date, index: true },
    lastClaimResult: { type: String }
});

const EndfieldSchema = new Schema<IEndfieldData>({
    accountToken: { type: String, required: true },
    accountName: { type: String, default: "Unknown" },
    lastClaim: { type: Date, index: true },
    lastClaimResult: { type: String }
});

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

/**
 * The Mongoose model for User documents, providing access to Hoyolab and Endfield credentials.
 */
export const User = mongoose.model<IUser>("User", UserSchema);
