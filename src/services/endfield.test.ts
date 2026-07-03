import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { EndfieldService, formatEndfieldResult } from "./endfield";
import {
    ENDFIELD_GRANT_URL,
    ENDFIELD_GENERATE_CRED_URL,
    ENDFIELD_REFRESH_TOKEN_URL,
    ENDFIELD_BINDING_URL,
    ENDFIELD_ATTENDANCE_URL
} from "../constants";

// We mock global fetch
const originalFetch = global.fetch;

const mockResponses: Record<string, unknown> = {};
let shouldThrow = false;

describe("EndfieldService", () => {
    beforeEach(() => {
        shouldThrow = false;
        // Default success responses
        mockResponses[ENDFIELD_GRANT_URL] = {
            status: 0,
            data: { code: "mock_oauth_code" }
        };
        mockResponses[ENDFIELD_GENERATE_CRED_URL] = {
            code: 0,
            data: { cred: "mock_cred" }
        };
        mockResponses[ENDFIELD_REFRESH_TOKEN_URL] = {
            code: 0,
            data: { token: "mock_sign_token" }
        };
        mockResponses[ENDFIELD_BINDING_URL] = {
            code: 0,
            data: {
                list: [
                    {
                        appCode: "endfield",
                        bindingList: [
                            {
                                roles: [
                                    {
                                        roleId: "4797152091",
                                        serverId: "2"
                                    }
                                ]
                            }
                        ]
                    }
                ]
            }
        };
        mockResponses[ENDFIELD_ATTENDANCE_URL] = {
            code: 0,
            message: "OK",
            data: {
                reward: {
                    name: "Oryundum",
                    count: 100
                }
            }
        };

        global.fetch = mock(async (url: string | URL | Request) => {
            if (shouldThrow) {
                throw new Error("Network error");
            }
            const urlString = url.toString();
            const responseData = mockResponses[urlString];
            if (responseData) {
                return {
                    ok: true,
                    json: async () => responseData
                } as Response;
            }
            return {
                ok: false,
                json: async () => ({})
            } as Response;
        }) as unknown as typeof fetch;
    });

    afterEach(() => {
        global.fetch = originalFetch;
    });

    test("successful claim flows properly", async () => {
        const service = new EndfieldService({ accountToken: "valid_token" });
        const result = await service.claim();

        expect(result.success).toBe(true);
        expect(result.message).toBe("Check-in completed");
        const results = result.results;
        expect(results).toBeDefined();
        if (results) {
            expect(results).toHaveLength(1);
            expect(results[0]!.success).toBe(true);
            expect(results[0]!.rewards).toBe("Oryundum x100");
        }
    });

    test("handles expired ACCOUNT_TOKEN (Step 1 failure)", async () => {
        mockResponses[ENDFIELD_GRANT_URL] = { status: 1, message: "Expired" };
        const service = new EndfieldService({ accountToken: "expired_token" });
        const result = await service.claim();

        expect(result.success).toBe(false);
        expect(result.message).toContain("ACCOUNT_TOKEN may be expired");
        expect(result.tokenExpired).toBe(true);
    });

    test("handles API Error 19001 (cannot get character position)", async () => {
        mockResponses[ENDFIELD_ATTENDANCE_URL] = {
            code: 19001,
            message: "无法获取当前角色位置，请确保已登录游戏"
        };
        const service = new EndfieldService({ accountToken: "valid_token" });
        const result = await service.claim();

        expect(result.success).toBe(false);
        expect(result.message).toBe("Some check-ins failed");
        const results = result.results;
        expect(results).toBeDefined();
        if (results) {
            expect(results).toHaveLength(1);
            expect(results[0]!.success).toBe(false);
            expect(results[0]!.message).toBe(
                "Cannot get character position. Please make sure you have logged into the game."
            );
        }
    });

    test("handles already signed in today (code 1001)", async () => {
        mockResponses[ENDFIELD_ATTENDANCE_URL] = {
            code: 1001,
            message: "Already claimed"
        };
        const service = new EndfieldService({ accountToken: "valid_token" });
        const result = await service.claim();

        expect(result.success).toBe(true);
        const results = result.results;
        expect(results).toBeDefined();
        if (results) {
            expect(results[0]!.success).toBe(true);
            expect(results[0]!.already).toBe(true);
        }
    });

    test("formatEndfieldResult formats success result", () => {
        const result = {
            success: true,
            message: "Check-in completed",
            results: [
                {
                    gameRole: "3_4797152091_2",
                    success: true,
                    message: "Signed in successfully",
                    rewards: "Oryundum x100"
                }
            ]
        };
        const formatted = formatEndfieldResult(result);
        expect(formatted).toContain("Arknights: Endfield");
        expect(formatted).toContain("✅ [4797152091_2] Signed in successfully — Oryundum x100");
    });

    test("formatEndfieldResult formats 19001 error result", () => {
        const result = {
            success: false,
            message: "Some check-ins failed",
            results: [
                {
                    gameRole: "3_4797152091_2",
                    success: false,
                    message: "Cannot get character position. Please make sure you have logged into the game."
                }
            ]
        };
        const formatted = formatEndfieldResult(result);
        expect(formatted).toContain(
            "❌ [4797152091_2] Cannot get character position. Please make sure you have logged into the game."
        );
    });
});
