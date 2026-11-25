---
name: MongoDB with Mongoose
description: Database patterns for user data and credential storage in autoclaim-bot
---

# MongoDB with Mongoose

This skill covers MongoDB/Mongoose patterns used by autoclaim-bot.

## Connection Setup

Read the URI from `config`, never from `process.env` inside services:

```typescript
// src/database/connection.ts
import mongoose from "mongoose";
import { config } from "../../config";
import { logger } from "../../core/logger";

export async function connectDatabase(): Promise<void> {
    await mongoose.connect(config.mongodb.uri);
    logger.info("Connected to MongoDB");
}

export async function disconnectDatabase(): Promise<void> {
    await mongoose.disconnect();
}
```

## User Schema Pattern

```typescript
// src/database/models/user.ts
import mongoose, { Schema, type Document } from "mongoose";

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
    accountToken: string;
    accountName: string;
    lastClaim?: Date;
    lastClaimResult?: string;
}

export interface IUser extends Document {
    discordId: string;
    username: string;
    hoyolab?: IHoyolabData;
    endfield?: IEndfieldData;
    settings: { notifyOnClaim: boolean };
    createdAt: Date;
    updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
    {
        discordId: { type: String, required: true, unique: true },
        username: { type: String, required: true },
        hoyolab: { type: Schema.Types.Mixed },
        endfield: { type: Schema.Types.Mixed },
        settings: { notifyOnClaim: { type: Boolean, default: true } }
    },
    { timestamps: true }
);

UserSchema.index({ "hoyolab.token": 1, "hoyolab.lastClaim": 1 }, { sparse: true });
UserSchema.index({ "endfield.accountToken": 1, "endfield.lastClaim": 1 }, { sparse: true });
UserSchema.index({ "settings.notifyOnClaim": 1 });

export const User = mongoose.model<IUser>("User", UserSchema);
```

## Common Operations

```typescript
// Get a user
const user = await User.findOne({ discordId });

// Upsert on concurrent create
let user = await User.findOne({ discordId });
if (!user) {
    try {
        user = await User.create({ discordId, username });
    } catch (error) {
        if ((error as { code?: number }).code === 11000) {
            user = await User.findOne({ discordId });
        } else {
            throw error;
        }
    }
}

// Read-only queries
const leanUser = await User.findOne({ discordId }).lean();
```

## Claim History

`ClaimHistory` uses collection `claim_history`, stores success/rewards/message,
and has a compound index on `discordId` + `claimedAt` plus a 30-day TTL on
`claimedAt`. Use `recordClaimHistory()` from `src/database/models/claim-history.ts`
instead of writing raw documents.

## Security

- Encrypt Hoyolab and Endfield credentials with `encryptToken()` from
  `src/utils/token-crypto.ts` before storing them.
- Read them with `decryptTokenCompat()`; migrate legacy/plaintext values on write.
- `CR_ETP_RT` is an environment secret, not user data. Do not store it in MongoDB.
- Never log raw tokens or cookies.

## Best Practices

- Use indexes for frequently queried fields.
- Use `lean()` for read-only queries.
- Handle connection errors gracefully.
- Use transactions for multi-document updates.
