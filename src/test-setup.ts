/**
 * Test preload — runs before every test file via:
 *   bun test --preload ./src/test-setup.ts
 *
 * Populates process.env with stub values BEFORE any test file is
 * imported, so that config.ts (which calls process.exit(1) when
 * TOKEN_ENCRYPTION_KEY is absent) can be safely evaluated by
 * transitive imports such as token-crypto.ts.
 *
 * Uses ??= so a real value already present in the environment
 * (e.g. a CI secret) is never overwritten.
 *
 * ⚠️  These are test-only stubs — never use in production.
 */

// Tell config/logger we are running tests
process.env.NODE_ENV ??= "test";

// ── Required ─────────────────────────────────────────────────────────────────

// config.ts calls process.exit(1) when this is absent.
// 64 hex chars = 32 bytes, matches the openssl rand -hex 32 format.
process.env.TOKEN_ENCRYPTION_KEY ??= "0000000000000000000000000000000000000000000000000000000000000001";

// ── Optional — prevent accidental live connections ────────────────────────────

process.env.DISCORD_TOKEN ??= "test-discord-token";
process.env.DISCORD_CLIENT_ID ??= "000000000000000000";
process.env.MONGODB_URI ??= "mongodb://localhost:27017/autoclaim-bot-test";
