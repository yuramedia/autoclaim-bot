# Discord Auto-Claim Bot

Bot Discord untuk auto-claim daily rewards dari:
- **Hoyolab**: Genshin Impact, Honkai Star Rail, Honkai Impact 3rd, Tears of Themis, Zenless Zone Zero
- **SKPORT/Endfield**: Arknights: Endfield

## Requirements

- [Bun](https://bun.sh) runtime
- MongoDB database

## Setup

1. Copy `.env.example` ke `.env` dan isi dengan value yang benar:
   ```bash
   cp .env.example .env
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Register slash commands:
   ```bash
   bun run deploy
   ```

4. Start bot:
   ```bash
   bun start
   ```

## Commands

| Command | Description |
|---------|-------------|
| `/setup-hoyolab` | Simpan token Hoyolab |
| `/setup-endfield` | Simpan token Endfield/SKPORT |
| `/claim` | Manual claim rewards sekarang |
| `/status` | Lihat status akun dan last claim |
| `/remove` | Hapus token dari database |

## Cara Mendapatkan Token

### Hoyolab Token
1. Buka [HoYoLAB](https://www.hoyolab.com) dan login
2. Tekan F12 → Application → Cookies
3. Copy nilai `ltoken_v2` dan `ltuid_v2`
4. Format: `ltoken_v2=xxx; ltuid_v2=xxx`

### Endfield/SKPORT Token
1. Buka [Endfield Sign-in Page](https://game.skport.com/endfield/sign-in) dan login
2. Tekan F12 → Application → Cookies → `.skport.com`
3. Cari `ACCOUNT_TOKEN` dan copy value-nya

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DISCORD_TOKEN` | Bot token dari Discord Developer Portal |
| `DISCORD_CLIENT_ID` | Application ID dari Discord Developer Portal |
| `MONGODB_URI` | MongoDB connection string |
| `CLAIM_HOUR` | Jam claim otomatis (default: 9) |
| `CLAIM_MINUTE` | Menit claim otomatis (default: 0) |

## License

MIT
