---
description: Hoyolab API integration patterns and best practices
activation: manual
---

# Hoyolab API Rules

Mention `@hoyolab-api` to activate these rules.

## Authentication
- Hoyolab uses cookie-based authentication
- Required cookies: `ltoken_v2`, `ltuid_v2`, `cookie_token_v2`
- Cookies expire and need periodic refresh

## API Endpoints

### Daily Check-in
- Each game has its own act_id for check-in
- Genshin Impact: `e202102251931481`
- Honkai Star Rail: `e202303301540311`
- Honkai Impact 3rd: `e202110291205111`
- Zenless Zone Zero: `e202406031448091`

### Dynamic Secret (DS)
For certain endpoints, DS header is required:
- Use salt: `6s25p5ox5y14ber1234567890abcdef`
- Format: `t,r,DS` where DS = MD5 hash

## Rate Limiting
- Respect rate limits (usually 1 request per second)
- Implement exponential backoff on 429 errors
- Cache responses where appropriate

## Error Handling
Common retcodes:
- `0`: Success
- `-1071`: Please log in (auth issue)
- `-5003`: Already claimed today
- `10001`: Invalid request

## Best Practices
- Store user credentials encrypted
- Validate cookies before claim attempts
- Provide clear feedback for claim results
