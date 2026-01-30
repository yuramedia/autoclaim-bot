import axios, { type AxiosInstance } from 'axios';

export interface ClaimResult {
    success: boolean;
    game: string;
    message: string;
    alreadyClaimed?: boolean;
}

interface GameConfig {
    name: string;
    url: string;
    actId: string;
    extraHeaders?: Record<string, string>;
}

const GAMES: Record<string, GameConfig> = {
    genshin: {
        name: 'Genshin Impact',
        url: 'https://sg-hk4e-api.hoyolab.com/event/sol/sign',
        actId: 'e202102251931481',
    },
    starRail: {
        name: 'Honkai: Star Rail',
        url: 'https://sg-public-api.hoyolab.com/event/luna/os/sign',
        actId: 'e202303301540311',
    },
    honkai3: {
        name: 'Honkai Impact 3rd',
        url: 'https://sg-public-api.hoyolab.com/event/mani/sign',
        actId: 'e202110291205111',
    },
    tearsOfThemis: {
        name: 'Tears of Themis',
        url: 'https://sg-public-api.hoyolab.com/event/luna/os/sign',
        actId: 'e202308141137581',
    },
    zenlessZoneZero: {
        name: 'Zenless Zone Zero',
        url: 'https://sg-public-api.hoyolab.com/event/luna/zzz/os/sign',
        actId: 'e202406031448091',
        extraHeaders: {
            'x-rpc-signgame': 'zzz',
        },
    },
};

const DEFAULT_HEADERS = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'x-rpc-app_version': '2.34.1',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'x-rpc-client_type': '4',
    'Referer': 'https://act.hoyolab.com/',
    'Origin': 'https://act.hoyolab.com',
};

export class HoyolabService {
    private client: AxiosInstance;
    private token: string;

    constructor(token: string) {
        this.token = token;
        this.client = axios.create({
            timeout: 30000,
            headers: {
                ...DEFAULT_HEADERS,
                'Cookie': token,
            },
        });
    }

    async claimGame(gameKey: string): Promise<ClaimResult> {
        const game = GAMES[gameKey];
        if (!game) {
            return {
                success: false,
                game: gameKey,
                message: 'Unknown game',
            };
        }

        try {
            const url = `${game.url}?lang=en-us&act_id=${game.actId}`;
            const headers: Record<string, string> = {};

            if (game.extraHeaders) {
                Object.assign(headers, game.extraHeaders);
            }

            const response = await this.client.post(url, null, { headers });
            const data = response.data;

            if (data.retcode === 0 || data.message === 'OK') {
                return {
                    success: true,
                    game: game.name,
                    message: 'Claimed successfully!',
                };
            }

            // Already claimed today
            if (data.retcode === -5003 || data.message?.includes('already')) {
                return {
                    success: true,
                    game: game.name,
                    message: 'Already claimed today',
                    alreadyClaimed: true,
                };
            }

            // Captcha/risk detected
            if (data.data?.gt_result?.is_risk) {
                return {
                    success: false,
                    game: game.name,
                    message: 'CAPTCHA required - please claim manually',
                };
            }

            return {
                success: false,
                game: game.name,
                message: data.message || 'Unknown error',
            };
        } catch (error: any) {
            return {
                success: false,
                game: game.name,
                message: error.message || 'Request failed',
            };
        }
    }

    async claimAll(enabledGames: Record<string, boolean>): Promise<ClaimResult[]> {
        const results: ClaimResult[] = [];

        for (const [gameKey, enabled] of Object.entries(enabledGames)) {
            if (!enabled) continue;

            // Add delay between requests to avoid rate limiting
            if (results.length > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            const result = await this.claimGame(gameKey);
            results.push(result);
        }

        return results;
    }

    async validateToken(): Promise<{ valid: boolean; message: string }> {
        try {
            // Try to check Genshin daily info to validate token
            const response = await this.client.get(
                'https://sg-hk4e-api.hoyolab.com/event/sol/info?lang=en-us&act_id=e202102251931481'
            );

            if (response.data.retcode === 0) {
                return { valid: true, message: 'Token valid' };
            }

            return { valid: false, message: response.data.message || 'Invalid token' };
        } catch (error: any) {
            return { valid: false, message: error.message || 'Validation failed' };
        }
    }
}

export function formatHoyolabResults(results: ClaimResult[]): string {
    if (results.length === 0) {
        return 'No games configured for claiming';
    }

    return results
        .map(r => {
            const icon = r.success ? (r.alreadyClaimed ? '🔄' : '✅') : '❌';
            return `${icon} **${r.game}**: ${r.message}`;
        })
        .join('\n');
}
