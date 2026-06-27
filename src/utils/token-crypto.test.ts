/**
 * Unit tests for token-crypto.ts
 *
 * Covers: encrypt → decrypt round-trip, v1 format validation,
 * IV randomness (same plaintext → different ciphertext),
 * HKDF key derivation, legacy format support, and error behavior.
 */

import { describe, test, expect } from "bun:test";
import { encryptToken, decryptToken, decryptTokenSafe } from "./token-crypto";

// ── Round-trip ───────────────────────────────────────────────────────────────

describe("encryptToken / decryptToken", () => {
    test("round-trip: decrypt(encrypt(x)) === x", () => {
        const token = "ltoken_v2=abc123; ltuid_v2=456789; cookie_token_v2=xyz;";
        expect(decryptToken(encryptToken(token))).toBe(token);
    });

    test("works with short strings", () => {
        expect(decryptToken(encryptToken("x"))).toBe("x");
    });

    test("works with empty string", () => {
        expect(decryptToken(encryptToken(""))).toBe("");
    });

    test("works with unicode characters", () => {
        const token = "日本語テスト🎮";
        expect(decryptToken(encryptToken(token))).toBe(token);
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
        // Skip the "v1" prefix — only check the 3 data segments
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
        // Different IV → different output
        expect(enc1).not.toBe(enc2);
        // Both still decrypt correctly
        expect(decryptToken(enc1)).toBe(token);
        expect(decryptToken(enc2)).toBe(token);
    });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe("decryptToken error behavior", () => {
    test("throws on plaintext input (not encrypted format)", () => {
        const plain = "ltoken_v2=old_plain_token; ltuid_v2=12345;";
        expect(() => decryptToken(plain)).toThrow();
    });

    test("throws on wrong number of segments", () => {
        expect(() => decryptToken("only:two")).toThrow();
        expect(() => decryptToken("one")).toThrow();
        expect(() => decryptToken("a:b:c:d:e")).toThrow();
    });

    test("throws on segments with non-hex data in 3-part format", () => {
        expect(() => decryptToken("notHex:notHex:notHex")).toThrow();
    });

    test("throws on tampered ciphertext (wrong auth tag)", () => {
        const encrypted = encryptToken("original");
        const parts = encrypted.split(":");
        // Tamper with the ciphertext segment
        parts[3] = "deadbeef".repeat(4);
        const tampered = parts.join(":");
        expect(() => decryptToken(tampered)).toThrow();
    });

    test("throws on wrong version prefix", () => {
        const encrypted = encryptToken("test");
        const parts = encrypted.split(":");
        parts[0] = "v2";
        const wrongVersion = parts.join(":");
        expect(() => decryptToken(wrongVersion)).toThrow();
    });
});

// ── Legacy format support ────────────────────────────────────────────────────

describe("legacy format (3-part, no v1 prefix)", () => {
    test("decrypts legacy 3-part format (iv:authTag:ciphertext)", () => {
        // Encrypt to get a valid ciphertext, then strip the v1 prefix to simulate legacy format
        const encrypted = encryptToken("legacy-token");
        const parts = encrypted.split(":");
        // Remove "v1" prefix → legacy format
        const legacy = parts.slice(1).join(":");
        expect(decryptToken(legacy)).toBe("legacy-token");
    });

    test("throws on legacy format with corrupted data", () => {
        const encrypted = encryptToken("test");
        const parts = encrypted.split(":");
        // Corrupt ciphertext, remove v1 prefix
        parts[3] = "deadbeef".repeat(4);
        const legacyTampered = parts.slice(1).join(":");
        expect(() => decryptToken(legacyTampered)).toThrow();
    });
});

// ── decryptTokenSafe ──────────────────────────────────────────────────────────

describe("decryptTokenSafe", () => {
    test("returns { decrypted: true, value } for valid encrypted token", () => {
        const token = "safe-token-test";
        const result = decryptTokenSafe(encryptToken(token));
        expect(result.decrypted).toBe(true);
        expect(result.value).toBe(token);
    });

    test("returns { decrypted: false, value } for plaintext input", () => {
        const plain = "not-encrypted-at-all";
        const result = decryptTokenSafe(plain);
        expect(result.decrypted).toBe(false);
        expect(result.value).toBe(plain);
    });

    test("returns { decrypted: false, value } for invalid format", () => {
        const result = decryptTokenSafe("only:two");
        expect(result.decrypted).toBe(false);
        expect(result.value).toBe("only:two");
    });
});
