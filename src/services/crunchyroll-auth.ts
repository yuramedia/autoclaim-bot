/**
 * Crunchyroll account-auth request builder.
 *
 * The etp_rt cookie grant is the working path. The password grant is kept only
 * as a legacy fallback and should be removed if Crunchyroll rejects it.
 */

const WEB_BASIC_AUTH = "bm9haWhkZXZtXzZpeWcwYThsMHE6";
const WEB_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const API_ORIGIN = "https://beta-api.crunchyroll.com";
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type AccountAuthMode = "etp_rt" | "password";

export interface AccountAuthRequest {
    mode: AccountAuthMode;
    body: string;
    headers: Record<string, string>;
}

export interface AccountAuthRequestInput {
    etpRt?: string;
    email?: string;
    password?: string;
    deviceId: string;
    androidBasicAuth: string;
    androidUserAgent: string;
}

/** Strip the optional `etp_rt=` prefix and validate the UUID shape. */
export function normalizeEtpRt(value: string | undefined): string | null {
    if (!value) return null;
    const normalized = value.trim().replace(/^etp_rt=/i, "");
    return UUID_RE.test(normalized) ? normalized : null;
}

/** Build the OAuth request for account-scoped Crunchyroll access. */
export function buildAccountAuthRequest(input: AccountAuthRequestInput): AccountAuthRequest | null {
    const etpRt = normalizeEtpRt(input.etpRt);
    if (etpRt) {
        return {
            mode: "etp_rt",
            body: new URLSearchParams({
                device_id: input.deviceId,
                device_type: "Firefox on Windows",
                grant_type: "etp_rt_cookie"
            }).toString(),
            headers: {
                Authorization: `Basic ${WEB_BASIC_AUTH}`,
                Accept: "application/json",
                "Accept-Charset": "UTF-8",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent": WEB_USER_AGENT,
                Origin: API_ORIGIN,
                Referer: `${API_ORIGIN}/`,
                Cookie: `etp_rt=${etpRt}`
            }
        };
    }

    if (input.email && input.password) {
        return {
            mode: "password",
            body: new URLSearchParams({
                grant_type: "password",
                username: input.email,
                password: input.password,
                scope: "offline_access",
                device_id: input.deviceId,
                device_type: "Android TV"
            }).toString(),
            headers: {
                Authorization: `Basic ${input.androidBasicAuth}`,
                "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
                "User-Agent": input.androidUserAgent
            }
        };
    }

    return null;
}
