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

### 🔧 Setup

| Command           | Description                                 |
| ----------------- | ------------------------------------------- |
| `/setup-hoyolab`  | Simpan token Hoyolab dan pilih game         |
| `/setup-endfield` | Simpan token SKPORT/Endfield                |

### 🎮 Claim & Redeem

| Command                  | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `/claim`                 | Manual claim semua reward (Hoyolab + Endfield)   |
| `/claim hoyolab`         | Manual claim Hoyolab saja                        |
| `/claim endfield`        | Manual claim Endfield saja                       |
| `/redeem <game> <code>`  | Redeem gift code untuk game tertentu             |

### 📊 Info

| Command      | Description                              |
| ------------ | ---------------------------------------- |
| `/status`    | Lihat status token & riwayat claim       |
| `/statistic` | Statistik claim keseluruhan bot          |
| `/ping`      | Cek latency bot                          |
| `/speedtest` | Test kecepatan network server bot        |
| `/help`      | Tampilkan panduan penggunaan bot         |

### ⚙️ Settings

| Command           | Description                                 |
| ----------------- | ------------------------------------------- |
| `/settings`       | Toggle notifikasi DM claim                  |
| `/embed-settings` | Kustomisasi tampilan embed (warna, layout)  |
| `/remove`         | Hapus token dari database                   |

### 📺 Crunchyroll & Anime Feed

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `/subcr`           | Subscribe notifikasi episode Crunchyroll         |
| `/crunchyroll-feed`| Lihat episode terbaru Crunchyroll                |
| `/crrelease`       | Cari rilis Crunchyroll                           |
| `/bestrelease`     | Rekomendasi best encode untuk anime tertentu     |

### 🗂️ Utilitas

| Command     | Description                                |
| ----------- | ------------------------------------------ |
| `/embed`    | Kirim ulang link sebagai embed Discord     |
| `/u2-feed`  | Lihat torrent terbaru dari U2 BDMV feed    |
| `/kbbi`     | Cari kata di Kamus Besar Bahasa Indonesia  |
| `/jisho`    | Cari kata dalam kamus Jepang–Indonesia     |

## Environment Variables

| Variable            | Required | Description                                                          |
| ------------------- | :------: | -------------------------------------------------------------------- |
| `DISCORD_TOKEN`     | ✅       | Bot token dari Discord Developer Portal                              |
| `DISCORD_CLIENT_ID` | ✅       | Application ID dari Discord Developer Portal                         |
| `MONGODB_URI`       | ✅       | MongoDB connection string                                            |
| `CLAIM_HOUR`        | —        | Jam claim otomatis, format 24 jam (0–23). Default: `0`              |
| `CLAIM_MINUTE`      | —        | Menit claim otomatis (0–59). Default: `0`                           |
| `CR_EMAIL`          | —        | Email akun Crunchyroll (untuk fitur subtitle download)              |
| `CR_PASSWORD`       | —        | Password akun Crunchyroll                                            |
| `U2_RSS_URL`        | —        | Full RSS URL dari U2 BDMV (termasuk passkey). Feed dinonaktifkan jika kosong |
| `AMENZB_API_KEY`    | —        | API key dari [amenzb.moe](https://amenzb.moe/profile)               |

> Waktu claim menggunakan timezone **UTC+8 (Asia/Singapore)**. `CLAIM_HOUR=0` dan `CLAIM_MINUTE=0` berarti pukul **00:00 UTC+8** (tengah malam).

## Cara Mendapatkan Token

### Hoyolab Token

1. **PENTING:** `cookie_token` bersifat **HttpOnly**, jadi tidak muncul di `document.cookie`.
2. Buka halaman redeem (contoh: [Genshin Gift](https://genshin.hoyoverse.com/en/gift)).
3. Tekan F12 → **Application** (Chrome) atau **Storage** (Firefox) → **Cookies**.
4. Cari dan copy value dari:
    - `ltoken_v2` (atau `ltoken`)
    - `ltuid_v2` (atau `ltuid`)
    - `cookie_token_v2` (atau `cookie_token`) — opsional, diperlukan untuk `/redeem`
    - `account_id_v2` (atau `account_id`)
5. Gabungkan formatnya:
   `ltoken_v2=...; ltuid_v2=...; cookie_token_v2=...; account_id_v2=...;`

### Endfield/SKPORT Token

1. Buka [Endfield Sign-in Page](https://game.skport.com/endfield/sign-in) dan login
2. Buka tab baru: `https://web-api.skport.com/cookie_store/account_token`
3. Copy bagian `code` dari JSON yang muncul
4. Paste di `/setup-endfield`

## Deployment

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan development dan deployment.

## License

[MIT](LICENSE)
