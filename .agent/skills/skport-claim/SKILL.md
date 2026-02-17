---
name: SKPORT Auto-Claim
description: Implementation patterns for SKPORT/Endfield daily check-in with direct token usage
---

# SKPORT Auto-Claim Skill

This skill covers SKPORT (Arknights: Endfield) API integration for auto-claim.
Based on: https://github.com/canaria3406/skport-auto-sign

## Authentication

### Direct Token Usage

Uses `SK_OAUTH_CRED_KEY` (cookie) and `SK_TOKEN_CACHE_KEY` (localStorage) from https://game.skport.com/endfield/sign-in.

```typescript
// Required tokens:
const cred = "SK_OAUTH_CRED_KEY"; // From Cookie
const signToken = "SK_TOKEN_CACHE_KEY"; // From LocalStorage
```

### How to Get Tokens

1. Login to https://game.skport.com/endfield/sign-in
2. Open F12 DevTools → **Console**
3. Paste and run this script:

```javascript
function gc(n) {
    const v = `; ${document.cookie}`;
    const p = v.split(`; ${n}=`);
    if (p.length === 2) return p.pop().split(";").shift();
}
let cred = gc("SK_OAUTH_CRED_KEY") || "Not found";
let token = localStorage.getItem("SK_TOKEN_CACHE_KEY") || "Not found";
console.log("SK_OAUTH_CRED_KEY:", cred);
console.log("SK_TOKEN_CACHE_KEY:", token);
```

### Token Expiry

- Tokens can expire (API returns code `10000`)
- When expired, user must re-run the script and update via `/setup-endfield`

## Signing

### Generate Sign (HMAC-SHA256 + MD5)

```typescript
function generateSign(
    path: string,
    method: string,
    headers: Record<string, string>,
    body: string,
    token: string
): string {
    let stringToSign = path + (method === "GET" ? "" : body);
    if (headers.timestamp) stringToSign += headers.timestamp;

    const headerObj: Record<string, string> = {};
    for (const key of ["platform", "timestamp", "dId", "vName"]) {
        if (headers[key]) headerObj[key] = headers[key];
        else if (key === "dId") headerObj[key] = "";
    }
    stringToSign += JSON.stringify(headerObj);

    const hmacHex = crypto.createHmac("sha256", token).update(stringToSign).digest("hex");
    return crypto.createHash("md5").update(hmacHex).digest("hex");
}
```

## Daily Check-in API

### Endpoint

```
POST https://zonai.skport.com/web/v1/game/endfield/attendance
```

### Headers

```typescript
const headers = {
    ...ENDFIELD_HEADERS, // Standard browser headers
    cred: "SK_OAUTH_CRED_KEY_VALUE",
    "sk-game-role": `3_${uid}_${server}`, // 3=Endfield, server: 2=Asia, 3=Americas/EU
    "sk-language": "en",
    timestamp: Math.floor(Date.now() / 1000).toString(),
    sign: generateSign(path, "POST", headers, "", skTokenCacheKey)
};
```

### Response Codes

| code    | Meaning                                 |
| ------- | --------------------------------------- |
| `0`     | Success                                 |
| `0`     | + `hasToday: true` = Already claimed    |
| `10000` | Token expired - user must update tokens |
| Other   | Error (check message)                   |

### Success Response

```json
{
    "code": 0,
    "data": {
        "awardIds": [{ "id": "..." }],
        "resourceInfoMap": {
            "id": { "name": "...", "count": 1, "icon": "..." }
        }
    }
}
```

## Service Implementation Pattern

```typescript
export class EndfieldService {
    constructor(options: {
        cred: string; // SK_OAUTH_CRED_KEY
        skTokenCacheKey: string; // SK_TOKEN_CACHE_KEY
        gameId: string;
        server?: string;
        language?: string;
    }) {}

    async claim(): Promise<EndfieldClaimResult> {
        // 1. Build timestamp
        // 2. Build headers with signing
        // 3. POST to attendance endpoint
        // 4. Handle response codes (0=success, 10000=expired)
        // 5. Parse rewards and return result
    }
}
```

## Error Handling

- Return `tokenExpired: true` when API returns code `10000`
- Display warning to user to update tokens via `/setup-endfield`
- Log all errors with `[Endfield]` prefix for debugging

## Database Schema

```typescript
interface IEndfieldData {
    skOAuthCredKey: string; // SK_OAUTH_CRED_KEY from cookie
    skTokenCacheKey: string; // SK_TOKEN_CACHE_KEY from localStorage
    gameId: string;
    server: string; // "2" = Asia, "3" = Americas/Europe
    accountName: string;
    lastClaim?: Date;
    lastClaimResult?: string;
}
```
