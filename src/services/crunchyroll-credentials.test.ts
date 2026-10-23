import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import {
    parseVersionTuple,
    compareVersions,
    parseConstantsFromSource,
    syncCrunchyrollCredentials,
    startCrunchyrollCredentialsScheduler,
    stopCrunchyrollCredentialsScheduler
} from "./crunchyroll-credentials";
import {
    getActiveCrunchyrollAuth,
    setActiveCrunchyrollAuth,
    CRUNCHYROLL_BASIC_AUTH,
    CRUNCHYROLL_USER_AGENT
} from "../constants/crunchyroll";
import { config } from "../config";

describe("CrunchyrollCredentials Service", () => {
    const originalConfigAuth = config.crunchyroll.basicAuth;
    const originalConfigUA = config.crunchyroll.userAgent;
    const originalAutoUpdate = config.crunchyroll.autoUpdateCredentials;
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
        // Reset in-memory credentials to defaults
        setActiveCrunchyrollAuth({
            basicAuth: CRUNCHYROLL_BASIC_AUTH,
            userAgent: CRUNCHYROLL_USER_AGENT
        });
        config.crunchyroll.basicAuth = "";
        config.crunchyroll.userAgent = "";
        config.crunchyroll.autoUpdateCredentials = true;
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        config.crunchyroll.basicAuth = originalConfigAuth;
        config.crunchyroll.userAgent = originalConfigUA;
        config.crunchyroll.autoUpdateCredentials = originalAutoUpdate;
        stopCrunchyrollCredentialsScheduler();
    });

    describe("parseVersionTuple", () => {
        test("correctly parses User-Agent with Android TV build number", () => {
            const ua =
                "Crunchyroll/ANDROIDTV/3.71.0_22359 (Android 12; en-US; SHIELD Android TV Build/SR1A.220624.014)";
            expect(parseVersionTuple(ua)).toEqual([3, 71, 0, 22359]);
        });

        test("correctly parses version string with parenthesized build number", () => {
            const version = "3.70.0 (22358)";
            expect(parseVersionTuple(version)).toEqual([3, 70, 0, 22358]);
        });

        test("correctly parses standard semver without build number", () => {
            const version = "3.70.1";
            expect(parseVersionTuple(version)).toEqual([3, 70, 1, 0]);
        });

        test("returns default tuple for invalid version string", () => {
            expect(parseVersionTuple("invalid-version")).toEqual([0, 0, 0, 0]);
            expect(parseVersionTuple("")).toEqual([0, 0, 0, 0]);
        });
    });

    describe("compareVersions", () => {
        test("correctly identifies newer major version", () => {
            expect(compareVersions("4.0.0", "3.71.0")).toBeGreaterThan(0);
            expect(compareVersions("3.71.0", "4.0.0")).toBeLessThan(0);
        });

        test("correctly identifies newer minor version", () => {
            expect(compareVersions("3.72.0", "3.71.0")).toBeGreaterThan(0);
            expect(compareVersions("3.70.0", "3.71.0")).toBeLessThan(0);
        });

        test("correctly identifies newer patch version", () => {
            expect(compareVersions("3.71.1", "3.71.0")).toBeGreaterThan(0);
        });

        test("correctly identifies newer build number", () => {
            const vOld = "Crunchyroll/ANDROIDTV/3.71.0_22358";
            const vNew = "Crunchyroll/ANDROIDTV/3.71.0_22359";
            expect(compareVersions(vNew, vOld)).toBeGreaterThan(0);
            expect(compareVersions(vOld, vNew)).toBeLessThan(0);
        });

        test("returns 0 for identical versions", () => {
            const v = "Crunchyroll/ANDROIDTV/3.71.0_22359";
            expect(compareVersions(v, v)).toBe(0);
        });
    });

    describe("parseConstantsFromSource", () => {
        test("extracts CRUNCHYROLL_BASIC_AUTH and CRUNCHYROLL_USER_AGENT from typescript source", () => {
            const mockSource = `
export const CRUNCHYROLL_BASIC_AUTH =
    "dng1bThwOWZzYm16em15bnZnemo6Q2NjNXp6UkNxTDgtNWpVTDdJZFJRODU2Z0l6WlVZVk0=";

export const CRUNCHYROLL_USER_AGENT =
    "Crunchyroll/ANDROIDTV/3.72.0_22360 (Android 12; en-US; SHIELD Android TV Build/SR1A.220624.014)";
            `;

            const parsed = parseConstantsFromSource(mockSource);
            expect(parsed).not.toBeNull();
            expect(parsed?.basicAuth).toBe("dng1bThwOWZzYm16em15bnZnemo6Q2NjNXp6UkNxTDgtNWpVTDdJZFJRODU2Z0l6WlVZVk0=");
            expect(parsed?.userAgent).toBe(
                "Crunchyroll/ANDROIDTV/3.72.0_22360 (Android 12; en-US; SHIELD Android TV Build/SR1A.220624.014)"
            );
        });

        test("returns null if basic auth or user agent is missing", () => {
            const invalidSource = `export const OTHER_CONST = "hello";`;
            expect(parseConstantsFromSource(invalidSource)).toBeNull();
        });
    });

    describe("getActiveCrunchyrollAuth & setActiveCrunchyrollAuth", () => {
        test("updates and returns active credentials", () => {
            const testCreds = {
                basicAuth: "dGVzdC1hdXRo",
                userAgent: "Crunchyroll/ANDROIDTV/4.0.0_99999"
            };
            setActiveCrunchyrollAuth(testCreds);
            expect(getActiveCrunchyrollAuth()).toEqual(testCreds);
        });
    });

    describe("syncCrunchyrollCredentials", () => {
        test("returns false when auto-update is disabled", async () => {
            config.crunchyroll.autoUpdateCredentials = false;
            const updated = await syncCrunchyrollCredentials();
            expect(updated).toBe(false);
        });

        test("applies manual credentials from config when present", async () => {
            config.crunchyroll.basicAuth = "bWFudWFsLXRva2Vu";
            config.crunchyroll.userAgent = "Crunchyroll/ANDROIDTV/9.9.9_99999";

            const updated = await syncCrunchyrollCredentials();
            expect(updated).toBe(true);

            const active = getActiveCrunchyrollAuth();
            expect(active.basicAuth).toBe("bWFudWFsLXRva2Vu");
            expect(active.userAgent).toBe("Crunchyroll/ANDROIDTV/9.9.9_99999");
        });

        test("updates active credentials when remote has a newer version", async () => {
            const mockRemoteTs = `
export const CRUNCHYROLL_BASIC_AUTH = "bmV3LWF1dGgtdG9rZW4=";
export const CRUNCHYROLL_USER_AGENT = "Crunchyroll/ANDROIDTV/4.0.0_30000 (Android 12; en-US; SHIELD Android TV Build/SR1A.220624.014)";
            `;

            globalThis.fetch = mock(async () => {
                return new Response(mockRemoteTs, { status: 200 });
            }) as unknown as typeof globalThis.fetch;

            const updated = await syncCrunchyrollCredentials();
            expect(updated).toBe(true);

            const active = getActiveCrunchyrollAuth();
            expect(active.basicAuth).toBe("bmV3LWF1dGgtdG9rZW4=");
            expect(active.userAgent).toContain("4.0.0_30000");
        });

        test("does not downgrade if remote version is older", async () => {
            // Set active to 3.71.0_22359
            setActiveCrunchyrollAuth({
                basicAuth: "Y3VycmVudC1hdXRo",
                userAgent: "Crunchyroll/ANDROIDTV/3.71.0_22359"
            });

            // Remote has older 3.70.0_22358
            const mockRemoteTs = `
export const CRUNCHYROLL_BASIC_AUTH = "b2xkLWF1dGgtdG9rZW4=";
export const CRUNCHYROLL_USER_AGENT = "Crunchyroll/ANDROIDTV/3.70.0_22358";
            `;

            globalThis.fetch = mock(async () => {
                return new Response(mockRemoteTs, { status: 200 });
            }) as unknown as typeof globalThis.fetch;

            const updated = await syncCrunchyrollCredentials();
            expect(updated).toBe(false);

            // Active should remain current
            expect(getActiveCrunchyrollAuth().userAgent).toBe("Crunchyroll/ANDROIDTV/3.71.0_22359");
        });

        test("updates with force=true even when version numbers match but token changed", async () => {
            setActiveCrunchyrollAuth({
                basicAuth: "b2xkLXRva2Vu",
                userAgent: "Crunchyroll/ANDROIDTV/3.71.0_22359"
            });

            const mockRemoteTs = `
export const CRUNCHYROLL_BASIC_AUTH = "bmV3LXJlZnJlc2hlZC10b2tlbg==";
export const CRUNCHYROLL_USER_AGENT = "Crunchyroll/ANDROIDTV/3.71.0_22359";
            `;

            globalThis.fetch = mock(async () => {
                return new Response(mockRemoteTs, { status: 200 });
            }) as unknown as typeof globalThis.fetch;

            const updated = await syncCrunchyrollCredentials(true);
            expect(updated).toBe(true);
            expect(getActiveCrunchyrollAuth().basicAuth).toBe("bmV3LXJlZnJlc2hlZC10b2tlbg==");
        });

        test("handles HTTP failure gracefully", async () => {
            globalThis.fetch = mock(async () => {
                return new Response("Not Found", { status: 404 });
            }) as unknown as typeof globalThis.fetch;

            const updated = await syncCrunchyrollCredentials();
            expect(updated).toBe(false);
        });

        test("handles network exception gracefully", async () => {
            globalThis.fetch = mock(async () => {
                throw new Error("Network unreachable");
            }) as unknown as typeof globalThis.fetch;

            const updated = await syncCrunchyrollCredentials();
            expect(updated).toBe(false);
        });
    });

    describe("scheduler lifecycle", () => {
        test("starts and stops scheduler cleanly", () => {
            expect(() => startCrunchyrollCredentialsScheduler()).not.toThrow();
            // calling again should be idempotent
            expect(() => startCrunchyrollCredentialsScheduler()).not.toThrow();
            expect(() => stopCrunchyrollCredentialsScheduler()).not.toThrow();
        });
    });
});
