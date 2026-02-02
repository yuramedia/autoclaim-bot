---
name: Hoyolab Auto-Claim
description: Implementation patterns for Hoyolab daily check-in and code redemption
---

# Hoyolab Auto-Claim Skill

This skill covers Hoyolab API integration for auto-claim functionality.

## Supported Games

| Game | ACT_ID | BBS_ID |
|------|--------|--------|
| Genshin Impact | `e202102251931481` | `2` |
| Honkai Star Rail | `e202303301540311` | `6` |
| Honkai Impact 3rd | `e202110291205111` | `1` |
| Zenless Zone Zero | `e202406031448091` | `8` |
| Tears of Themis | `e202308141137581` | `4` |

## Authentication

### Required Cookies
```
ltoken_v2=xxx
ltuid_v2=xxx
cookie_token_v2=xxx
```

### Cookie String Format
```typescript
const cookieString = `ltoken_v2=${ltoken}; ltuid_v2=${ltuid}; cookie_token_v2=${cookieToken}`;
```

## Daily Check-in API

### Endpoint
```
POST https://sg-hk4e-api.hoyolab.com/event/sol/sign
```

### Headers
```typescript
const headers = {
  'Cookie': cookieString,
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.5',
  'Origin': 'https://act.hoyolab.com',
  'Referer': 'https://act.hoyolab.com/',
  'x-rpc-signgame': 'hk4e',
};
```

### Request Body
```typescript
const body = {
  act_id: 'e202102251931481',
  lang: 'en-us',
};
```

### Response Codes
| retcode | Message |
|---------|---------|
| `0` | Success |
| `-5003` | Already claimed |
| `-1071` | Please log in |
| `10001` | Invalid request |

## Code Redemption API

### Endpoint (Web API)
```
POST https://sg-hk4e-api.hoyolab.com/common/apicdkey/api/webExchangeCdkey
```

### Endpoint (App API - More Reliable)
```
POST https://sg-hk4e-api.hoyolab.com/common/apicdkey/api/webExchangeCdkeyHyl
```

### Dynamic Secret (DS) Header
For App API endpoints:
```typescript
function generateDS(): string {
  const salt = '6s25p5ox5y14ber1234567890abcdef';
  const t = Math.floor(Date.now() / 1000);
  const r = Math.random().toString(36).substring(2, 8);
  const c = crypto.createHash('md5')
    .update(`salt=${salt}&t=${t}&r=${r}`)
    .digest('hex');
  return `${t},${r},${c}`;
}
```

## Service Implementation Pattern

```typescript
// src/services/hoyolab.ts
export class HoyolabService {
  private cookies: string;
  
  constructor(cookies: HoyolabCookies) {
    this.cookies = this.buildCookieString(cookies);
  }
  
  async claimDaily(game: Game): Promise<ClaimResult> {
    const config = GAME_CONFIGS[game];
    
    const response = await fetch(config.signUrl, {
      method: 'POST',
      headers: this.getHeaders(config.signgame),
      body: JSON.stringify({
        act_id: config.actId,
        lang: 'en-us',
      }),
    });
    
    const data = await response.json();
    return this.parseClaimResult(data);
  }
}
```

## Error Handling
- Retry on network errors with exponential backoff
- Handle cookie expiration gracefully
- Notify users when re-authentication needed
- Rate limit requests (1 per second minimum)
