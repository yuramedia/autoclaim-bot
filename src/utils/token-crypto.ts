/**
 * Token Encryption Utility
 * AES-256-GCM encryption for sensitive tokens stored in MongoDB.
 *
 * Requires TOKEN_ENCRYPTION_KEY environment variable (any string — derived via HKDF to 32 bytes).
 *
 * Storage format: v1:hex(iv):hex(authTag):hex(ciphertext)
 * Format version "v1" prefix enables future algorithm changes without breaking backward compatibility.
 *
 * Key derivation: HKDF-SHA256 from the raw env var, with application-specific info string.
 * This replaces the previous single-pass SHA-256 approach, providing proper key stretching
 * and making future key rotation easier (change the HKDF salt/info without changing the env var).
 *
 * decryptToken() throws on decryption failure — no plaintext fallback.
 * Use decryptTokenSafe() for callers that need graceful handling of legacy/malformed data.
 */

import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "crypto";
import { config } from "../config";
import { logger } from "../core/logger";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // bytes
const FORMAT_VERSION = "v1";
const HKDF_INFO = "aes-256-gcm-token-encryption"; // application-specific info for HKDF

/** Derive a 32-byte key from the config value using HKDF-SHA256 (v1 format). */
function getKey(): Buffer {
    const raw = config.security.tokenEncryptionKey;
    if (!raw) {
        throw new Error(
            "TOKEN_ENCRYPTION_KEY is not set. Add it to your .env file. " +
                "Any random string works — e.g. run: openssl rand -hex 32"
        );
    }
    return Buffer.from(hkdfSync("sha256", raw, "", HKDF_INFO, 32));
}

/** Derive a 32-byte key using the legacy single-pass SHA-256 method (pre-v1 format).
 *  Used as a fallback for decrypting 3-part tokens that were encrypted before HKDF was introduced.
 */
function getLegacyKey(): Buffer {
    const raw = config.security.tokenEncryptionKey;
    if (!raw) {
        throw new Error("TOKEN_ENCRYPTION_KEY is not set.");
    }
    return createHash("sha256").update(raw).digest();
}

/**
 * Encrypt a token string.
 * Returns a colon-separated string: v1:hex(iv):hex(authTag):hex(ciphertext)
 *
 * @param plaintext - The raw token string to encrypt.
 * @returns The encrypted token in the v1 format.
 */
export function encryptToken(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${FORMAT_VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a token string.
 * Throws on decryption failure — no plaintext fallback.
 * Accepts both v1 (4-part) and legacy (3-part, no version prefix) formats.
 *
 * @param value - The encrypted token string (v1:iv:authTag:ciphertext or legacy iv:authTag:ciphertext).
 * @returns The decrypted plaintext token.
 * @throws Error if decryption fails or format is invalid.
 */
export function decryptToken(value: string): string {
    const parts = value.split(":");

    // v1 format: v1:iv:authTag:ciphertext (4 parts)
    if (parts.length === 4 && parts[0] === FORMAT_VERSION) {
        const [, ivHex, authTagHex, encryptedHex] = parts;
        if (!ivHex || !authTagHex || encryptedHex === undefined) {
            throw new Error("Invalid v1 encrypted token format: empty segments");
        }
        try {
            const key = getKey();
            const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
            decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

            return Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString(
                "utf8"
            );
        } catch {
            throw new Error("Token decryption failed — encryption key may have changed or data is corrupted");
        }
    }

    // Legacy format: iv:authTag:ciphertext (3 parts, no version prefix)
    // Support for tokens encrypted before the v1 format was introduced.
    // Try HKDF-derived key first (for recently-encrypted legacy tokens),
    // then fall back to legacy SHA-256 key (for older tokens encrypted before HKDF).
    if (parts.length === 3) {
        const [ivHex, authTagHex, encryptedHex] = parts;
        if (!ivHex || !authTagHex || encryptedHex === undefined) {
            throw new Error("Invalid legacy encrypted token format: empty segments");
        }
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const encrypted = Buffer.from(encryptedHex, "hex");

        // Try HKDF key first
        try {
            const key = getKey();
            const decipher = createDecipheriv(ALGORITHM, key, iv);
            decipher.setAuthTag(authTag);
            return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
        } catch {
            // HKDF key failed — try legacy SHA-256 key
        }

        // Try legacy SHA-256 key (pre-HKDF encryption)
        try {
            const legacyKey = getLegacyKey();
            const decipher = createDecipheriv(ALGORITHM, legacyKey, iv);
            decipher.setAuthTag(authTag);
            const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
            logger.info(
                "[token-crypto] Successfully decrypted legacy token with SHA-256 key. " +
                    "This token should be re-encrypted in v1 format at next save."
            );
            return decrypted;
        } catch {
            throw new Error(
                "Token decryption failed (legacy format) — tried both HKDF and SHA-256 keys. " +
                    "Encryption key may have changed or data is corrupted."
            );
        }
    }

    // Not an encrypted format at all — this is a plaintext token or invalid data.
    // In the old system, plaintext tokens were silently returned. Now we throw
    // to prevent security downgrade. If you have plaintext tokens in your DB,
    // run a migration to encrypt them first.
    throw new Error(
        `Token is not in encrypted format (expected v1:iv:authTag:ciphertext or legacy iv:authTag:ciphertext). ` +
            `If this is a plaintext token from before encryption was enabled, run a migration to encrypt it first.`
    );
}

/**
 * Safe decryption wrapper that returns a result object instead of throwing.
 * Useful for callers that need to distinguish between decryption success and failure
 * without disrupting their flow (e.g., migration scripts, diagnostics).
 *
 * @param value - The encrypted token string or potentially plaintext value.
 * @returns An object indicating whether decryption succeeded and the value.
 */
export function decryptTokenSafe(value: string): { decrypted: boolean; value: string } {
    try {
        return { decrypted: true, value: decryptToken(value) };
    } catch (error) {
        logger.warn(
            `[token-crypto] decryptTokenSafe failed: ${error instanceof Error ? error.message : String(error)}. ` +
                `Returning raw value — this token may need re-encryption.`
        );
        return { decrypted: false, value };
    }
}
