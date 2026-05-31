/**
 * Token Encryption Utility
 * AES-256-GCM encryption for sensitive tokens stored in MongoDB.
 *
 * Requires TOKEN_ENCRYPTION_KEY environment variable (any string — hashed to 32 bytes).
 *
 * Storage format: hex(iv):hex(authTag):hex(ciphertext)
 *
 * Backward compatibility: decryptToken() returns the original value if decryption fails,
 * so plaintext tokens already in the database continue to work until re-saved.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // bytes

/** Derive a 32-byte key from the env var using SHA-256. */
function getKey(): Buffer {
    const raw = process.env.TOKEN_ENCRYPTION_KEY;
    if (!raw) {
        throw new Error(
            "TOKEN_ENCRYPTION_KEY is not set. Add it to your .env file. " +
                "Any random string works — e.g. run: openssl rand -hex 32"
        );
    }
    return createHash("sha256").update(raw).digest();
}

/**
 * Encrypt a token string.
 * Returns a colon-separated hex string: iv:authTag:ciphertext
 *
 * @param plaintext - The raw token string to encrypt.
 * @returns The encrypted token in a colon-separated hex format.
 */
export function encryptToken(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt a token string.
 * Falls back to returning the original value on failure (plaintext backward-compat).
 *
 * @param value - The encrypted token string (in format iv:authTag:ciphertext) or a plaintext fallback.
 * @returns The decrypted token, or the original value if decryption fails or format is invalid.
 */
export function decryptToken(value: string): string {
    try {
        const parts = value.split(":");

        // Not encrypted format — return as-is (plaintext token already in DB)
        if (parts.length !== 3) return value;

        const [ivHex, authTagHex, encryptedHex] = parts;
        if (!ivHex || !authTagHex || !encryptedHex) return value;
        const key = getKey();
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
        decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

        return Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString("utf8");
    } catch {
        // Decryption failed — token is probably plaintext (pre-migration).
        return value;
    }
}
