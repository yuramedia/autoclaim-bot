import mongoose, { Schema, Document } from 'mongoose';

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

export interface IEndfieldData {
    token: string;
    accountName: string;
    lastClaim?: Date;
    lastClaimResult?: string;
}

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
    accountName: { type: String, default: 'Unknown' },
    games: {
        genshin: { type: Boolean, default: true },
        starRail: { type: Boolean, default: true },
        honkai3: { type: Boolean, default: false },
        tearsOfThemis: { type: Boolean, default: false },
        zenlessZoneZero: { type: Boolean, default: true },
    },
    lastClaim: { type: Date },
    lastClaimResult: { type: String },
});

const EndfieldSchema = new Schema<IEndfieldData>({
    token: { type: String, required: true },
    accountName: { type: String, default: 'Unknown' },
    lastClaim: { type: Date },
    lastClaimResult: { type: String },
});

const UserSchema = new Schema<IUser>(
    {
        discordId: { type: String, required: true, unique: true, index: true },
        username: { type: String, required: true },
        hoyolab: { type: HoyolabSchema },
        endfield: { type: EndfieldSchema },
        settings: {
            notifyOnClaim: { type: Boolean, default: true },
        },
    },
    {
        timestamps: true,
    }
);

export const User = mongoose.model<IUser>('User', UserSchema);
