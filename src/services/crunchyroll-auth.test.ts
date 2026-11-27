import { describe, expect, test } from "bun:test";
import { buildAccountAuthRequest, maskCredential, normalizeEtpRt } from "./crunchyroll-auth";

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
            deviceId: "device-1"
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

    test("maskCredential never emits plaintext", () => {
        const masked = maskCredential("super-secret-value");
        expect(masked).not.toContain("super-secret-value");
        expect(masked).toContain("[REDACTED]");
    });

    test("returns null when no etp_rt is configured", () => {
        const req = buildAccountAuthRequest({ deviceId: "device-1" });

        expect(req).toBeNull();
    });
});
