/**
 * HTTP Utility
 * Shared fetch helpers that guarantee every outbound request is time-bounded,
 * so a hung socket can never stall commands, schedulers, or startup.
 */

/** Default timeout applied when no explicit timeout is provided (10 seconds). */
export const DEFAULT_HTTP_TIMEOUT_MS = 10_000;

/**
 * Fetch options extending the standard RequestInit with a timeout override.
 * The `signal` member is omitted because the timeout owns cancellation.
 */
export type HttpOptions = Omit<RequestInit, "signal"> & {
    /** Timeout in milliseconds before the request is aborted. */
    timeoutMs?: number;
};

/**
 * Fetch a URL with a mandatory abort timeout.
 * On timeout the returned promise rejects with a TimeoutError, mirroring
 * native fetch behaviour for aborted requests.
 *
 * @param url - Target URL.
 * @param options - Request options plus optional `timeoutMs`.
 * @returns The fetch Response.
 */
export async function fetchWithTimeout(url: string, options: HttpOptions = {}): Promise<Response> {
    const { timeoutMs = DEFAULT_HTTP_TIMEOUT_MS, ...init } = options;
    return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/**
 * Fetch a URL and parse the response body as JSON.
 *
 * @param url - Target URL.
 * @param options - Request options plus optional `timeoutMs`.
 * @returns Parsed JSON value.
 */
export async function fetchJsonWithTimeout<T>(url: string, options: HttpOptions = {}): Promise<T> {
    const response = await fetchWithTimeout(url, options);
    return (await response.json()) as T;
}

/**
 * Fetch a URL and return the response body as text.
 *
 * @param url - Target URL.
 * @param options - Request options plus optional `timeoutMs`.
 * @returns Response body text.
 */
export async function fetchTextWithTimeout(url: string, options: HttpOptions = {}): Promise<string> {
    const response = await fetchWithTimeout(url, options);
    return await response.text();
}

/** Retry policy options for {@link withRetry}. */
export interface RetryOptions {
    /** Maximum number of attempts before giving up (default 3). */
    retries?: number;
    /** Base delay for exponential backoff in milliseconds (default 500ms). */
    baseDelayMs?: number;
    /**
     * Predicate deciding whether an error is transient and worth retrying.
     * Defaults to treating network/timeout failures as retriable.
     */
    shouldRetry?: (error: unknown) => boolean;
}

/** Default predicate: retry network-level failures (timeouts, socket errors, axios transport codes). */
function isTransientNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
        if (error.name === "AbortError" || error.name === "TimeoutError" || error.name === "TypeError") return true;
        const code = (error as Error & { code?: string }).code;
        if (
            code === "ECONNRESET" ||
            code === "ECONNREFUSED" ||
            code === "ETIMEDOUT" ||
            code === "EAI_AGAIN" ||
            code === "ECONNABORTED"
        ) {
            return true;
        }
    }
    return false;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Run an async operation with exponential backoff on transient failures.
 * Retries only when {@link RetryOptions.shouldRetry} approves the error;
 * final failure is rethrown to the caller.
 *
 * @param fn - Operation to execute.
 * @param options - Retry policy overrides.
 * @returns The result of the first successful attempt.
 */
export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
    const { retries = 3, baseDelayMs = 500, shouldRetry = isTransientNetworkError } = options;

    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt === retries || !shouldRetry(error)) throw error;
            await sleep(baseDelayMs * 2 ** attempt);
        }
    }
    throw lastError;
}
