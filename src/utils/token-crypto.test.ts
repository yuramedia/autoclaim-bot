/**
 * Unit tests for token-crypto.ts
 *
 * Covers: encrypt → decryptCompat round-trip, v1 format validation,
 * IV randomness, HKDF key derivation, legacy format support,
 * plaintext backward-compat, and error behavior.
 */

import { describe, test, expect } from "bun:test";
import { createCipheriv, createHash, randomBytes } from "crypto";
import { encryptToken, decryptTokenCompat } from "./token-crypto";

// ── Round-trip via decryptTokenCompat ───────────────────────────────────────

describe("encryptToken / decryptTokenCompat", () => {
    test("round-trip: decryptCompat(encrypt(x)) === x", () => {
        const token = "ltoken_v2=abc123; ltuid_v2=456789; cookie_token_v2=xyz;";
        const result = decryptTokenCompat(encryptToken(token));
        expect(result.value).toBe(token);
        expect(result.needsReEncryption).toBe(false);
    });

    test("works with short strings", () => {
        const result = decryptTokenCompat(encryptToken("x"));
        expect(result.value).toBe("x");
        expect(result.needsReEncryption).toBe(false);
    });

    test("works with empty string", () => {
        const result = decryptTokenCompat(encryptToken(""));
        expect(result.value).toBe("");
        expect(result.needsReEncryption).toBe(false);
    });

    test("works with unicode characters", () => {
        const token = "日本語テスト🎮";
        const result = decryptTokenCompat(encryptToken(token));
        expect(result.value).toBe(token);
        expect(result.needsReEncryption).toBe(false);
    });
});

// ── v1 Ciphertext format ─────────────────────────────────────────────────────

describe("encryptToken output format", () => {
    test("produces v1:iv:authTag:ciphertext (4 parts)", () => {
        const encrypted = encryptToken("test-token");
        const parts = encrypted.split(":");
        expect(parts).toHaveLength(4);
        expect(parts[0]).toBe("v1");
    });

    test("all data segments are valid hex strings", () => {
        const encrypted = encryptToken("test-token");
        const parts = encrypted.split(":");
        const hexPattern = /^[0-9a-f]+$/i;
        for (const part of parts.slice(1)) {
            expect(part).toMatch(hexPattern);
        }
    });

    test("IV segment is 32 hex chars (16 bytes)", () => {
        const encrypted = encryptToken("test-token");
        const parts = encrypted.split(":");
        expect(parts[1]!.length).toBe(32);
    });
});

// ── Randomness ───────────────────────────────────────────────────────────────

describe("IV randomness", () => {
    test("same plaintext produces different ciphertext each time", () => {
        const token = "same-hoyolab-token";
        const enc1 = encryptToken(token);
        const enc2 = encryptToken(token);
        expect(enc1).not.toBe(enc2);
        expect(decryptTokenCompat(enc1).value).toBe(token);
        expect(decryptTokenCompat(enc2).value).toBe(token);
    });
});

// ── Legacy format backward compat ────────────────────────────────────────────

describe("decryptTokenCompat legacy format (3-part, no v1 prefix)", () => {
    test("decrypts legacy 3-part format with needsReEncryption=true", () => {
        const encrypted = encryptToken("legacy-token");
        const parts = encrypted.split(":");
        const legacy = parts.slice(1).join(":");
        const result = decryptTokenCompat(legacy);
        expect(result.value).toBe("legacy-token");
        expect(result.needsReEncryption).toBe(true);
    });

    test("throws error for corrupted 3-part format (prevents data loss)", () => {
        const encrypted = encryptToken("test");
        const parts = encrypted.split(":");
        parts[3] = "deadbeef".repeat(4);
        const legacyTampered = parts.slice(1).join(":");
        expect(() => decryptTokenCompat(legacyTampered)).toThrow("Legacy token decryption failed");
    });

    test("decrypts real legacy tokens encrypted with pre-HKDF SHA-256 key", () => {
        const rawKey = process.env.TOKEN_ENCRYPTION_KEY;
        if (!rawKey) throw new Error("TOKEN_ENCRYPTION_KEY not set for test");
        const legacyKey = createHash("sha256").update(rawKey).digest();
        const iv = randomBytes(16);
        const cipher = createCipheriv("aes-256-gcm", legacyKey, iv);
        const plaintext = "ltoken_v2=old_sha256_encrypted_token; ltuid_v2=12345;";
        const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
        const authTag = cipher.getAuthTag();
        const legacyFormat = `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;

        const result = decryptTokenCompat(legacyFormat);
        expect(result.value).toBe(plaintext);
        expect(result.needsReEncryption).toBe(true);
    });
});

// ── Plaintext backward compat ────────────────────────────────────────────────

describe("decryptTokenCompat plaintext tokens", () => {
    test("returns plaintext as-is with needsReEncryption=true", () => {
        const plain = "ltoken_v2=abc; ltuid_v2=123;";
        const result = decryptTokenCompat(plain);
        expect(result.value).toBe(plain);
        expect(result.needsReEncryption).toBe(true);
    });

    test("arbitrary string returns as-is with needsReEncryption=true", () => {
        const result = decryptTokenCompat("some-random-string");
        expect(result.value).toBe("some-random-string");
        expect(result.needsReEncryption).toBe(true);
    });
});
