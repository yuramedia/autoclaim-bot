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
 * Result of a token decryption attempt.
 * When `needsReEncryption` is true, the token was recovered from a legacy or plaintext
 * format and should be re-encrypted in v1 format and saved back to the database.
 */
export interface DecryptResult {
    /** The recovered plaintext token value. */
    value: string;
    /** True if the token came from a legacy/plaintext format and needs to be re-encrypted in v1. */
    needsReEncryption: boolean;
}

/**
 * Decrypt a token string with full backward compatibility.
 *
 * Handles three cases:
 * 1. v1 format (4-part) — decrypts with HKDF key
 * 2. Legacy format (3-part) — tries HKDF key first, then SHA-256 legacy key
 * 3. Plaintext — returns raw value with needsReEncryption=true (migration path)
 *
 * If the token is in a legacy or plaintext format, the result will have `needsReEncryption=true`
 * so callers can re-encrypt and update the DB, progressively migrating all tokens to v1.
 *
 * @param value - The encrypted or plaintext token string from the database.
 * @returns A DecryptResult with the plaintext value and a re-encryption flag.
 */
export function decryptTokenCompat(value: string): DecryptResult {
    const parts = value.split(":");

    // v1 format: v1:iv:authTag:ciphertext (4 parts) — already in current format, no migration needed
    if (parts.length === 4 && parts[0] === FORMAT_VERSION) {
        const [, ivHex, authTagHex, encryptedHex] = parts;
        if (!ivHex || !authTagHex || encryptedHex === undefined) {
            throw new Error("Invalid v1 encrypted token format: empty segments");
        }
        try {
            const key = getKey();
            const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
            decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
            return {
                value: Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString(
                    "utf8"
                ),
                needsReEncryption: false
            };
        } catch {
            throw new Error("Token decryption failed — encryption key may have changed or data is corrupted");
        }
    }

    // Legacy format: iv:authTag:ciphertext (3 parts, no version prefix)
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
            return {
                value: Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"),
                needsReEncryption: true // Was in legacy format — re-encrypt as v1
            };
        } catch {
            // HKDF key failed
        }

        // Try legacy SHA-256 key (pre-HKDF encryption)
        try {
            const legacyKey = getLegacyKey();
            const decipher = createDecipheriv(ALGORITHM, legacyKey, iv);
            decipher.setAuthTag(authTag);
            logger.info(
                "[token-crypto] Decrypted legacy token with SHA-256 key. " +
                    "Token will be re-encrypted in v1 format and saved back to DB."
            );
            return {
                value: Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"),
                needsReEncryption: true
            };
        } catch {
            // Both keys failed — treat as potentially plaintext
            // (token might have been stored before encryption was enabled)
            logger.warn(
                "[token-crypto] Legacy 3-part format decryption failed with both keys. " +
                    "Treating as potentially plaintext token for migration."
            );
        }
    }

    // Plaintext token — return raw value with re-encryption flag
    // This is the migration path for tokens stored before encryption was enabled,
    // or for tokens where the encryption key has rotated and the old ciphertext is unrecoverable.
    // The caller should re-encrypt and update the DB.
    logger.warn(
        "[token-crypto] Token is not in encrypted format. " +
            "Returning raw value — this token will be re-encrypted in v1 format and saved back to DB."
    );
    return { value, needsReEncryption: true };
}
