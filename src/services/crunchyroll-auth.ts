/**
 * Crunchyroll account-auth request builder.
 *
 * The etp_rt cookie grant is the only supported path. The password grant was
 * removed because Crunchyroll no longer accepts it.
 */

const WEB_BASIC_AUTH = "bm9haWhkZXZtXzZpeWcwYThsMHE6";
const WEB_USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36";
const API_ORIGIN = "https://beta-api.crunchyroll.com";
const UUID_RE = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type AccountAuthMode = "etp_rt";

export interface AccountAuthRequest {
    mode: AccountAuthMode;
    body: string;
    headers: Record<string, string>;
}

export interface AccountAuthRequestInput {
    etpRt?: string;
    deviceId: string;
}

/** Return a log-safe representation of a secret without exposing its value. */
export function maskCredential(value: string): string {
    return `[REDACTED] (length ${value.length})`;
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

    return null;
}
