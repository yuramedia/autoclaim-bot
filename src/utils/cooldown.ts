/**
 * Command Cooldown Utility
 * In-memory per-user cooldown tracker.
 * Resets on bot restart (intentional — keeps it simple, no DB needed).
 */

// Map<commandName, Map<userId, lastUsedTimestamp>>
const cooldowns = new Map<string, Map<string, number>>();

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
