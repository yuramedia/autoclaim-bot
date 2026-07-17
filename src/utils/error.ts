/**
 * Error Handling Utilities
 * Consistent error handling patterns across the codebase
 */

/**
 * Type guard to check if an unknown value is an Error.
 * @param error - The value to check
 * @returns True if the value is an Error instance
 */
export function isError(error: unknown): error is Error {
    return error instanceof Error;
}

/**
 * Safely extract an error message from an unknown error type.
 * Handles Error instances, objects with message property, and primitives.
 * @param error - The error to extract message from
 * @returns A string error message
 */
export function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "object" && error !== null && "message" in error) {
        return String((error as { message: unknown }).message);
    }
    return String(error);
}

/**
 * Create a formatted error object for logging.
 * @param error - The error to format
 * @param context - Optional context string
 * @returns An object suitable for logging
 */
export function formatError(error: unknown, context?: string): { message: string; stack?: string; context?: string } {
    const result: { message: string; stack?: string; context?: string } = {
        message: getErrorMessage(error)
    };
    if (error instanceof Error && error.stack) {
        result.stack = error.stack;
    }
    if (context) {
        result.context = context;
    }
    return result;
}

/**
 * Wrap an async function with standardized error handling.
 * Returns a tuple of [result, error] where error is null on success.
 * @param fn - The async function to wrap
 * @returns A tuple of [result, error]
 */
export async function tryAsync<T>(fn: () => Promise<T>): Promise<[T | null, Error | null]> {
    try {
        const result = await fn();
        return [result, null];
    } catch (error) {
        return [null, isError(error) ? error : new Error(getErrorMessage(error))];
    }
}

/**
 * Wrap a sync function with standardized error handling.
 * Returns a tuple of [result, error] where error is null on success.
 * @param fn - The function to wrap
 * @returns A tuple of [result, error]
 */
export function trySync<T>(fn: () => T): [T | null, Error | null] {
    try {
        const result = fn();
        return [result, null];
    } catch (error) {
        return [null, isError(error) ? error : new Error(getErrorMessage(error))];
    }
}
