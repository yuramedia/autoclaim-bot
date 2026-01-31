import axios from 'axios';

export interface RedeemCode {
    code: string;
    description: string;
    added_at: number;
}

export interface HashblenResponse {
    hsr: RedeemCode[];
    genshin: RedeemCode[];
    zzz: RedeemCode[];
    retcode: number;
}

export class CodeSourceService {
    private static API_URL = 'https://db.hashblen.com/codes';

    static async getCodes(): Promise<HashblenResponse | null> {
        try {
            const response = await axios.get<HashblenResponse>(this.API_URL, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                },
                timeout: 10000,
            });

            if (response.status === 200 && response.data) {
                return response.data;
            }
            return null;
        } catch (error) {
            console.error('Failed to fetch codes from Hashblen:', error);
            return null;
        }
    }
}
