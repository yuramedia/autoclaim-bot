/**
 * Unit tests for error-handler.ts
 *
 * Covers: formatError (pure function), handleInteractionError (branching on
 * interaction state), and withErrorHandler (wrapper that catches errors and
 * routes to handleInteractionError).
 *
 * Discord Interaction objects are mocked as plain objects — only the
 * properties accessed at runtime are provided.
 */

import { describe, test, expect, mock } from "bun:test";
import { formatError, handleInteractionError, withErrorHandler } from "./error-handler";

// ── helpers ───────────────────────────────────────────────────────────────────

interface MockInteraction {
    id: string;
    isRepliable: () => boolean;
    replied: boolean;
    deferred: boolean;
    reply: ReturnType<typeof mock>;
    followUp: ReturnType<typeof mock>;
}

function makeMockInteraction(
    opts: {
        replied?: boolean;
        deferred?: boolean;
        repliable?: boolean;
    } = {}
): MockInteraction {
    return {
        id: "mock-interaction-123",
        isRepliable: () => opts.repliable ?? true,
        replied: opts.replied ?? false,
        deferred: opts.deferred ?? false,
        reply: mock(() => Promise.resolve(undefined)),
        followUp: mock(() => Promise.resolve(undefined))
    };
}

// ── formatError ───────────────────────────────────────────────────────────────

describe("formatError", () => {
    test("formats an Error as 'ErrorName: message'", () => {
        expect(formatError(new Error("something broke"))).toBe("Error: something broke");
    });

    test("formats a custom Error subclass using its name", () => {
        class DatabaseError extends Error {
            override name = "DatabaseError";
        }
        expect(formatError(new DatabaseError("connection refused"))).toBe("DatabaseError: connection refused");
    });

    test("converts a plain string to itself", () => {
        expect(formatError("plain error string")).toBe("plain error string");
    });

    test("converts a number via String()", () => {
        expect(formatError(42)).toBe("42");
    });

    test("converts null to 'null'", () => {
        expect(formatError(null)).toBe("null");
    });

    test("converts undefined to 'undefined'", () => {
        expect(formatError(undefined)).toBe("undefined");
    });

    test("converts a plain object via String() (Object.prototype.toString)", () => {
        expect(formatError({ code: 500 })).toBe("[object Object]");
    });
});

// ── handleInteractionError ────────────────────────────────────────────────────

describe("handleInteractionError", () => {
    test("calls reply() when the interaction has not yet been replied to or deferred", async () => {
        const interaction = makeMockInteraction({ replied: false, deferred: false });
        await handleInteractionError(interaction as any, new Error("test error"));
        expect(interaction.reply).toHaveBeenCalledTimes(1);
        expect(interaction.followUp).not.toHaveBeenCalled();
    });

    test("calls followUp() when the interaction has already been replied", async () => {
        const interaction = makeMockInteraction({ replied: true, deferred: false });
        await handleInteractionError(interaction as any, new Error("test error"));
        expect(interaction.followUp).toHaveBeenCalledTimes(1);
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test("calls followUp() when the interaction is deferred", async () => {
        const interaction = makeMockInteraction({ replied: false, deferred: true });
        await handleInteractionError(interaction as any, new Error("test error"));
        expect(interaction.followUp).toHaveBeenCalledTimes(1);
        expect(interaction.reply).not.toHaveBeenCalled();
    });

    test("does nothing when interaction is not repliable", async () => {
        const interaction = makeMockInteraction({ repliable: false });
        await handleInteractionError(interaction as any, new Error("test error"));
        expect(interaction.reply).not.toHaveBeenCalled();
        expect(interaction.followUp).not.toHaveBeenCalled();
    });

    test("sends the default error message when none is provided", async () => {
        const interaction = makeMockInteraction();
        await handleInteractionError(interaction as any, new Error("inner error"));
        const args = interaction.reply.mock.calls[0] as [{ content: string }];
        expect(args[0].content).toContain("error occurred");
    });

    test("sends the custom message when one is provided", async () => {
        const interaction = makeMockInteraction();
        await handleInteractionError(interaction as any, new Error("inner error"), "❌ Custom error message");
        const args = interaction.reply.mock.calls[0] as [{ content: string }];
        expect(args[0].content).toBe("❌ Custom error message");
    });

    test("does not throw when followUp itself rejects", async () => {
        const interaction = makeMockInteraction({ replied: true });
        interaction.followUp = mock(() => Promise.reject(new Error("followUp failed")));
        // Should resolve without throwing
        await expect(handleInteractionError(interaction as any, new Error("test"))).resolves.toBeUndefined();
    });
});

// ── withErrorHandler ──────────────────────────────────────────────────────────

describe("withErrorHandler", () => {
    test("calls the wrapped handler with the original interaction", async () => {
        const handler = mock(async (_: unknown) => undefined);
        const interaction = makeMockInteraction() as any;
        const wrapped = withErrorHandler(handler as any);
        await wrapped(interaction);
        expect(handler).toHaveBeenCalledWith(interaction);
    });

    test("returns the handler's resolved value (void)", async () => {
        const handler = mock(async (_: unknown) => undefined);
        const interaction = makeMockInteraction() as any;
        const wrapped = withErrorHandler(handler as any);
        await expect(wrapped(interaction)).resolves.toBeUndefined();
    });

    test("catches a thrown error and sends an error response to the interaction", async () => {
        const handler = mock(async (_: unknown) => {
            throw new Error("handler blew up");
        });
        const interaction = makeMockInteraction();
        const wrapped = withErrorHandler(handler as any);

        // Should NOT re-throw
        await expect(wrapped(interaction as any)).resolves.toBeUndefined();

        // Error response must have been sent via reply or followUp
        const respondedViaReply = interaction.reply.mock.calls.length > 0;
        const respondedViaFollowUp = interaction.followUp.mock.calls.length > 0;
        expect(respondedViaReply || respondedViaFollowUp).toBe(true);
    });

    test("uses the custom error message if provided", async () => {
        const handler = mock(async (_: unknown) => {
            throw new Error("oops");
        });
        const interaction = makeMockInteraction();
        const wrapped = withErrorHandler(handler as any, "❌ Command failed");
        await wrapped(interaction as any);

        const args = interaction.reply.mock.calls[0] as [{ content: string }];
        expect(args[0].content).toBe("❌ Command failed");
    });
});
