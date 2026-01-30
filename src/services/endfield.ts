import axios, { type AxiosInstance } from 'axios';
import crypto from 'crypto';

export interface EndfieldClaimResult {
    success: boolean;
    message: string;
    daysSignedIn?: number;
    reward?: string;
    alreadyClaimed?: boolean;
}

// API URLs
const OAUTH_GRANT_URL = 'https://as.gryphline.com/user/oauth2/v2/grant';
const GENERATE_CRED_URL = 'https://zonai.skport.com/web/v1/user/auth/generate_cred_by_code';
const AUTH_REFRESH_URL = 'https://zonai.skport.com/web/v1/auth/refresh';
const PLAYER_BINDING_URL = 'https://zonai.skport.com/api/v1/game/player/binding';
const ATTENDANCE_URL = 'https://zonai.skport.com/web/v1/game/endfield/attendance';

// Constants
const SKPORT_APP_CODE = '6eb76d4e13aa36e6';
const ENDFIELD_GAME_ID = '3';
const PLATFORM = '3';
const VNAME = '1.0.0';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class EndfieldService {
    private client: AxiosInstance;
    private accountToken: string;
    private credToken: string | null = null;
    private signToken: string | null = null;
    private gameRole: string | null = null;

    constructor(accountToken: string) {
        this.accountToken = accountToken;
        this.client = axios.create({
            timeout: 30000,
            headers: {
                'User-Agent': USER_AGENT,
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Origin': 'https://game.skport.com',
                'Referer': 'https://game.skport.com/',
                'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
                'Sec-Ch-Ua-Mobile': '?0',
                'Sec-Ch-Ua-Platform': '"Windows"',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-site',
            },
        });
    }

    private computeSign(path: string, timestamp: string, body: string = ''): string {
        if (!this.signToken) return '';

        const headersDict = {
            platform: PLATFORM,
            timestamp,
            dId: '',
            vName: VNAME,
        };
        const headersJson = JSON.stringify(headersDict);
        const signString = `${path}${body}${timestamp}${headersJson}`;

        // HMAC-SHA256
        const hmacResult = crypto
            .createHmac('sha256', this.signToken)
            .update(signString)
            .digest('hex');

        // MD5 of HMAC result
        return crypto.createHash('md5').update(hmacResult).digest('hex');
    }

    private async getOAuthCode(): Promise<string | null> {
        try {
            const response = await this.client.post(OAUTH_GRANT_URL, {
                token: this.accountToken,
                appCode: SKPORT_APP_CODE,
                type: 0,
            });

            if (response.data.status === 0 && response.data.data?.code) {
                return response.data.data.code;
            }
            console.error('OAuth grant failed:', response.data);
            return null;
        } catch (error: any) {
            console.error('OAuth grant error:', error.message);
            return null;
        }
    }

    private async generateCred(oauthCode: string): Promise<string | null> {
        try {
            const response = await this.client.post(GENERATE_CRED_URL, {
                kind: 1,
                code: oauthCode,
            });

            if (response.data.code === 0 && response.data.data?.cred) {
                return response.data.data.cred;
            }
            console.error('Generate cred failed:', response.data);
            return null;
        } catch (error: any) {
            console.error('Generate cred error:', error.message);
            return null;
        }
    }

    private async refreshSignToken(): Promise<boolean> {
        if (!this.credToken) return false;

        try {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const response = await this.client.get(AUTH_REFRESH_URL, {
                headers: {
                    cred: this.credToken,
                    platform: PLATFORM,
                    vname: VNAME,
                    timestamp,
                    'sk-language': 'en',
                },
            });

            if (response.data.code === 0 && response.data.data?.token) {
                this.signToken = response.data.data.token;
                return true;
            }
            console.error('Auth refresh failed:', response.data);
            return false;
        } catch (error: any) {
            console.error('Auth refresh error:', error.message);
            return false;
        }
    }

    private async getPlayerBinding(): Promise<boolean> {
        if (!this.credToken) return false;

        try {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const headers: Record<string, string> = {
                cred: this.credToken,
                platform: PLATFORM,
                vname: VNAME,
                timestamp,
                'sk-language': 'en',
            };

            if (this.signToken) {
                headers.sign = this.computeSign('/api/v1/game/player/binding', timestamp);
            }

            const response = await this.client.get(PLAYER_BINDING_URL, { headers });

            if (response.data.code === 0 && response.data.data?.list) {
                for (const app of response.data.data.list) {
                    if (app.appCode === 'endfield' && app.bindingList?.length > 0) {
                        const binding = app.bindingList[0];
                        const defaultRole = binding.defaultRole || binding.roles?.[0];

                        if (defaultRole?.roleId && defaultRole?.serverId) {
                            this.gameRole = `${ENDFIELD_GAME_ID}_${defaultRole.roleId}_${defaultRole.serverId}`;
                            return true;
                        }
                    }
                }
            }
            console.warn('No Endfield binding found');
            return false;
        } catch (error: any) {
            console.error('Player binding error:', error.message);
            return false;
        }
    }

    async claim(): Promise<EndfieldClaimResult> {
        // Step 1: Get OAuth code
        const oauthCode = await this.getOAuthCode();
        if (!oauthCode) {
            return {
                success: false,
                message: 'Failed to get OAuth code. Token may be invalid or expired.',
            };
        }

        // Step 2: Generate credential
        const cred = await this.generateCred(oauthCode);
        if (!cred) {
            this.credToken = oauthCode; // Fallback
        } else {
            this.credToken = cred;
        }

        // Step 3: Refresh sign token
        await this.refreshSignToken();

        // Step 4: Get player binding
        await this.getPlayerBinding();

        // Step 5: Make attendance request
        try {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const path = '/web/v1/game/endfield/attendance';

            const headers: Record<string, string> = {
                cred: this.credToken!,
                platform: PLATFORM,
                vname: VNAME,
                timestamp,
                'sk-language': 'en',
                'Content-Type': 'application/json',
            };

            if (this.gameRole) {
                headers['sk-game-role'] = this.gameRole;
            }

            if (this.signToken) {
                headers.sign = this.computeSign(path, timestamp);
            }

            const response = await this.client.post(ATTENDANCE_URL, null, { headers });
            return this.parseResponse(response.data);
        } catch (error: any) {
            // Try to parse error response
            if (error.response?.data) {
                return this.parseResponse(error.response.data, error.response.status);
            }
            return {
                success: false,
                message: error.message || 'Request failed',
            };
        }
    }

    private parseResponse(data: any, statusCode: number = 200): EndfieldClaimResult {
        const code = data.code ?? -1;
        const message = data.message || 'Unknown response';

        if (code === 0) {
            const resultData = data.data || {};
            let reward: string | undefined;

            if (resultData.awardIds && resultData.resourceInfoMap) {
                try {
                    const rewards: string[] = [];
                    for (const award of resultData.awardIds) {
                        const item = resultData.resourceInfoMap[award.id];
                        if (item) {
                            rewards.push(`${item.name} x${item.count || 1}`);
                        }
                    }
                    if (rewards.length > 0) {
                        reward = rewards.join(', ');
                    }
                } catch {
                    // Ignore parse errors
                }
            }

            return {
                success: true,
                message: 'Sign-in successful!',
                daysSignedIn: resultData.signInCount,
                reward,
            };
        }

        // Already signed in
        if (
            code === 1001 ||
            code === 10001 ||
            message.toLowerCase().includes('already') ||
            message.includes('重复签到') ||
            statusCode === 403
        ) {
            return {
                success: true,
                message: 'Already signed in today',
                alreadyClaimed: true,
            };
        }

        // Auth failed
        if (code === 10002) {
            return {
                success: false,
                message: 'Authentication failed. Please refresh your token.',
            };
        }

        return {
            success: false,
            message: `Sign-in failed: ${message} (code: ${code})`,
        };
    }

    async validateToken(): Promise<{ valid: boolean; message: string }> {
        const oauthCode = await this.getOAuthCode();
        if (oauthCode) {
            return { valid: true, message: 'Token valid' };
        }
        return { valid: false, message: 'Invalid or expired token' };
    }
}

export function formatEndfieldResult(result: EndfieldClaimResult): string {
    const icon = result.success ? (result.alreadyClaimed ? '🔄' : '✅') : '❌';
    let text = `${icon} **Arknights: Endfield**: ${result.message}`;

    if (result.reward) {
        text += `\n   📦 Reward: ${result.reward}`;
    }
    if (result.daysSignedIn) {
        text += `\n   📅 Days signed: ${result.daysSignedIn}`;
    }

    return text;
}
