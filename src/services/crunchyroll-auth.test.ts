import { describe, expect, test } from "bun:test";
import { buildAccountAuthRequest, normalizeEtpRt } from "./crunchyroll-auth";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("Crunchyroll account auth request", () => {
    test("normalizeEtpRt accepts raw and prefixed UUID cookies only", () => {
        expect(normalizeEtpRt(UUID)).toBe(UUID);
        expect(normalizeEtpRt(`etp_rt=${UUID}`)).toBe(UUID);
        expect(normalizeEtpRt("not-a-uuid")).toBeNull();
    });

    test("prefers etp_rt cookie grant with web client headers", () => {
        const req = buildAccountAuthRequest({
            etpRt: `etp_rt=${UUID}`,
            email: "user@example.com",
            password: "secret",
            deviceId: "device-1",
            androidBasicAuth: "android-basic",
            androidUserAgent: "android-ua"
        });

        expect(req).not.toBeNull();
        expect(req!.mode).toBe("etp_rt");
        const body = new URLSearchParams(req!.body);
        expect(body.get("grant_type")).toBe("etp_rt_cookie");
        expect(body.get("device_id")).toBe("device-1");
        expect(body.get("device_type")).toBe("Firefox on Windows");
        expect(req!.headers["Cookie"]).toBe(`etp_rt=${UUID}`);
        expect(req!.headers["Authorization"]).toMatch(/^Basic /);
        expect(req!.headers["User-Agent"]).toMatch(/^Mozilla\//);
    });

    test("keeps password grant as fallback when no etp_rt is configured", () => {
        const req = buildAccountAuthRequest({
            email: "user@example.com",
            password: "secret",
            deviceId: "device-1",
            androidBasicAuth: "android-basic",
            androidUserAgent: "android-ua"
        });

        expect(req).not.toBeNull();
        expect(req!.mode).toBe("password");
        const body = new URLSearchParams(req!.body);
        expect(body.get("grant_type")).toBe("password");
        expect(body.get("username")).toBe("user@example.com");
        expect(req!.headers["Authorization"]).toBe("Basic android-basic");
        expect(req!.headers["User-Agent"]).toBe("android-ua");
    });
});
