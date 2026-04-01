---
name: SKPORT Auto-Claim
description: Implementation patterns for SKPORT/Endfield daily check-in with dynamic token refresh
---

# SKPORT Auto-Claim Skill

This skill covers SKPORT (Arknights: Endfield) API integration for auto-claim.
Reference: https://github.com/nano-shino/EndfieldCheckin

## Authentication

### ACCOUNT_TOKEN (Long-Lasting)

Uses a single `ACCOUNT_TOKEN` obtained from `web-api.skport.com/cookie_store/account_token`.
This token lasts weeks/months and dynamically generates fresh credentials before each check-in.

### How to Get ACCOUNT_TOKEN

1. Login to https://game.skport.com/endfield/sign-in
2. Open a new tab: `web-api.skport.com/cookie_store/account_token`
3. Copy the `code` value from the JSON response
4. Paste in `/setup-endfield`

### Token Expiry

- `ACCOUNT_TOKEN` lasts weeks/months (much longer than old session tokens)
- When expired, user re-visits the URL above and updates via `/setup-endfield`

## Auth Pipeline

Before each attendance request, the service runs a 4-step auth pipeline:

```
ACCOUNT_TOKEN
  → 1. getOAuthCode()    POST gryphline.com/user/oauth2/v2/grant
  → 2. getCred()         POST zonai.skport.com/generate_cred_by_code
  → 3. getSignToken()    GET  zonai.skport.com/web/v1/auth/refresh
  → 4. getPlayerBindings()  GET  zonai.skport.com/api/v1/game/player/binding
  → 5. sendAttendance() per role
```

### Step 1: Get OAuth Code

```typescript
const payload = { token: accountToken, appCode: "6eb76d4e13aa36e6", type: 0 };
// POST https://as.gryphline.com/user/oauth2/v2/grant
// Returns: { status: 0, data: { code: "..." } }
```

### Step 2: Generate Cred

```typescript
const payload = { kind: 1, code: oauthCode };
// POST https://zonai.skport.com/web/v1/user/auth/generate_cred_by_code
// Returns: { code: 0, data: { cred: "..." } }
```

### Step 3: Get Sign Token

```typescript
// GET https://zonai.skport.com/web/v1/auth/refresh
// Headers: cred, platform, vname, timestamp, sk-language
// Returns: { code: 0, data: { token: "..." } }
```

### Step 4: Get Player Bindings (Auto-Detect Roles)

```typescript
// GET https://zonai.skport.com/api/v1/game/player/binding
// Headers: cred, platform, vname, timestamp, sk-language, sign
// Returns game roles like "3_{roleId}_{serverId}" for all regions
```

## Signing (HMAC-SHA256 + MD5)

```typescript
function computeSign(path: string, body: string, timestamp: string, signToken: string): string {
    const headerObj = { platform: "3", timestamp, dId: "", vName: "1.0.0" };
    const signString = path + body + timestamp + JSON.stringify(headerObj);
    const hmacHex = crypto.createHmac("sha256", signToken).update(signString).digest("hex");
    return crypto.createHash("md5").update(hmacHex).digest("hex");
}
```

## Daily Check-in API

```
POST https://zonai.skport.com/web/v1/game/endfield/attendance
```

### Response Codes

| code    | Meaning                  |
| ------- | ------------------------ |
| `0`     | Success (message = "OK") |
| `1001`  | Already signed in today  |
| `10001` | Already signed in today  |
| `10002` | Token expired            |
| Other   | Error (check message)    |

## Service Implementation Pattern

```typescript
export class EndfieldService {
    constructor(options: { accountToken: string; language?: string }) {}

    async claim(): Promise<EndfieldClaimResult> {
        // 1. Run auth pipeline (OAuth → cred → signToken)
        // 2. Get player bindings (auto-detect all game roles)
        // 3. Send attendance for each role
        // 4. Return aggregated results
    }
}
```

## Database Schema

```typescript
interface IEndfieldData {
    accountToken: string; // ACCOUNT_TOKEN from web-api.skport.com
    accountName: string;
    lastClaim?: Date;
    lastClaimResult?: string;
}
```
