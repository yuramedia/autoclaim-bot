/**
 * Command Cooldown Utility
 * In-memory per-user cooldown tracker with automatic cleanup.
 */

// Map<commandName, Map<userId, lastUsedTimestamp>>
const cooldowns = new Map<string, Map<string, number>>();

/** Cleanup interval (5 minutes) */
const CLEANUP_INTERVAL = 5 * 60 * 1000;

/** Maximum age for cooldown entries (1 hour) */
const MAX_COOLDOWN_AGE = 60 * 60 * 1000;

/**
 * Cleanup expired cooldown entries to prevent memory leaks.
 * Removes entries older than MAX_COOLDOWN_AGE.
 */
function cleanupExpiredCooldowns(): void {
    const now = Date.now();
    let totalRemoved = 0;

    for (const [commandName, userMap] of cooldowns) {
        let removed = 0;
        for (const [userId, timestamp] of userMap) {
            if (now - timestamp > MAX_COOLDOWN_AGE) {
                userMap.delete(userId);
                removed++;
            }
        }
        // Remove empty command maps
        if (userMap.size === 0) {
            cooldowns.delete(commandName);
        }
        totalRemoved += removed;
    }

    if (totalRemoved > 0) {
        // Log at debug level for troubleshooting
    }
}

// Run cleanup periodically
const cleanupTimer = setInterval(cleanupExpiredCooldowns, CLEANUP_INTERVAL);
// Prevent the timer from keeping the process alive
if (cleanupTimer.unref) {
    cleanupTimer.unref();
}

/**
 * Returns the remaining cooldown in milliseconds.
 * Returns 0 if the user is not on cooldown.
 *
 * @param commandName - The name of the command to check cooldown for.
 * @param userId - The Discord user ID of the user.
 * @param cooldownMs - The total cooldown duration in milliseconds.
 * @returns The remaining cooldown in milliseconds, or 0 if not on cooldown.
 */
export function getCooldownRemaining(commandName: string, userId: string, cooldownMs: number): number {
    const commandMap = cooldowns.get(commandName);
    if (!commandMap) return 0;

    const lastUsed = commandMap.get(userId);
    if (!lastUsed) return 0;

    const elapsed = Date.now() - lastUsed;
    return elapsed < cooldownMs ? cooldownMs - elapsed : 0;
}

/**
 * Stamps a cooldown for a user on a command (call after successful execution).
 *
 * @param commandName - The name of the command to stamp.
 * @param userId - The Discord user ID of the user to stamp.
 */
export function setCooldown(commandName: string, userId: string): void {
    if (!cooldowns.has(commandName)) cooldowns.set(commandName, new Map());
    cooldowns.get(commandName)!.set(userId, Date.now());
}

/**
 * Formats a remaining ms value to a human-readable string, e.g. "4m 32s" or "28s".
 *
 * @param remainingMs - The remaining cooldown duration in milliseconds.
 * @returns A formatted human-readable cooldown duration string.
 */
export function formatCooldown(remainingMs: number): string {
    const totalSec = Math.ceil(remainingMs / 1000);
    const minutes = Math.floor(totalSec / 60);
    const seconds = totalSec % 60;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

/**
 * Gracefully shutdown the cooldown cleanup timer.
 * Call this during bot shutdown to clean up resources.
 */
export function shutdownCooldown(): void {
    clearInterval(cleanupTimer);
    cooldowns.clear();
}
