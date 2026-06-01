/**
 * Unit tests for token-crypto.ts
 *
 * Covers: encrypt → decrypt round-trip, format validation,
 * IV randomness (same plaintext → different ciphertext),
 * and backward-compat with plaintext tokens already in DB.
 */

import { describe, test, expect } from "bun:test";
import { encryptToken, decryptToken } from "./token-crypto";

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

// ── Ciphertext format ────────────────────────────────────────────────────────

describe("encryptToken output format", () => {
    test("produces iv:authTag:ciphertext (3 hex segments)", () => {
        const encrypted = encryptToken("test-token");
        const parts = encrypted.split(":");
        expect(parts).toHaveLength(3);
    });

    test("all segments are valid hex strings", () => {
        const encrypted = encryptToken("test-token");
        const hexPattern = /^[0-9a-f]+$/i;
        for (const part of encrypted.split(":")) {
            expect(part).toMatch(hexPattern);
        }
    });

    test("IV segment is 32 hex chars (16 bytes)", () => {
        const [iv] = encryptToken("test-token").split(":");
        expect(iv!.length).toBe(32);
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

// ── Backward compatibility ───────────────────────────────────────────────────

describe("decryptToken backward compatibility", () => {
    test("returns plaintext as-is when not in encrypted format", () => {
        const plain = "ltoken_v2=old_plain_token; ltuid_v2=12345;";
        expect(decryptToken(plain)).toBe(plain);
    });

    test("returns value as-is when it has wrong number of segments", () => {
        expect(decryptToken("only:two")).toBe("only:two");
        expect(decryptToken("one")).toBe("one");
        expect(decryptToken("a:b:c:d")).toBe("a:b:c:d");
    });

    test("returns value as-is when segments contain non-hex data", () => {
        const nonHex = "notHex:notHex:notHex";
        expect(decryptToken(nonHex)).toBe(nonHex);
    });

    test("returns value as-is when auth tag is wrong (tampered ciphertext)", () => {
        const encrypted = encryptToken("original");
        const parts = encrypted.split(":");
        // Tamper with the ciphertext segment
        parts[2] = "deadbeef".repeat(4);
        const tampered = parts.join(":");
        expect(decryptToken(tampered)).toBe(tampered);
    });
});
