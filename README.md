# Discord Auto-Claim Bot

Bot Discord untuk auto-claim daily rewards dan notifikasi feed:

- **Hoyolab**: Genshin Impact, Honkai Star Rail, Honkai Impact 3rd, Tears of Themis, Zenless Zone Zero
- **SKPORT/Endfield**: Arknights: Endfield
- **Crunchyroll**: episode terbaru, rilis, lineup, dan subtitle (butuh `CR_ETP_RT`)
- **Feed lain**: U2 BDMV dan YouTube
- **Utilitas**: KBBI, Jisho, embed, antihack

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

| Command           | Description                         |
| ----------------- | ----------------------------------- |
| `/setup-hoyolab`  | Simpan token Hoyolab dan pilih game |
| `/setup-endfield` | Simpan token SKPORT/Endfield        |

### 🎮 Claim & Redeem

| Command                 | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `/claim`                | Manual claim semua reward (Hoyolab + Endfield) |
| `/claim hoyolab`        | Manual claim Hoyolab saja                      |
| `/claim endfield`       | Manual claim Endfield saja                     |
| `/redeem <game> <code>` | Redeem gift code untuk game tertentu           |

### 📊 Info

| Command      | Description                        |
| ------------ | ---------------------------------- |
| `/status`    | Lihat status token & riwayat claim |
| `/statistic` | Statistik claim keseluruhan bot    |
| `/ping`      | Cek latency bot                    |
| `/help`      | Tampilkan panduan penggunaan bot   |

### ⚙️ Settings

| Command           | Description                                |
| ----------------- | ------------------------------------------ |
| `/settings`       | Toggle notifikasi DM claim                 |
| `/embed-settings` | Kustomisasi tampilan embed (warna, layout) |
| `/remove`         | Hapus token dari database                  |
| `/antihack`       | Kelola kanal jebakan akun compromise       |

### 📺 Crunchyroll & Anime Feed

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `/subcr`            | Subscribe notifikasi episode Crunchyroll     |
| `/crunchyroll-feed` | Lihat episode terbaru Crunchyroll            |
| `/cr`               | Atur pengumuman lineup Crunchyroll           |
| `/crrelease`        | Cari rilis Crunchyroll                       |
| `/bestrelease`      | Rekomendasi best encode untuk anime tertentu |

### 🗂️ Utilitas

| Command    | Description                               |
| ---------- | ----------------------------------------- |
| `/embed`   | Kirim ulang link sebagai embed Discord    |
| `/u2-feed` | Lihat torrent terbaru dari U2 BDMV feed   |
| `/youtube` | Atur notifikasi channel YouTube           |
| `/kbbi`    | Cari kata di Kamus Besar Bahasa Indonesia |
| `/jisho`   | Cari kata dalam kamus Jepang–Indonesia    |

## Environment Variables

| Variable                     | Required | Description                                                                                               |
| ---------------------------- | :------: | --------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`              |    ✅    | Bot token dari Discord Developer Portal                                                                   |
| `DISCORD_CLIENT_ID`          |    ✅    | Application ID dari Discord Developer Portal                                                              |
| `MONGODB_URI`                |    ✅    | MongoDB connection string                                                                                 |
| `NODE_ENV`                   |    —     | Runtime environment (`development` or `production`). Default: `development`                               |
| `CLAIM_HOUR`                 |    —     | Jam claim otomatis, format 24 jam (0–23). Default: `0`                                                    |
| `CLAIM_MINUTE`               |    —     | Menit claim otomatis (0–59). Default: `0`                                                                 |
| `CR_ETP_RT`                  |    —     | `etp_rt` cookie from a logged-in browser (preferred account auth; UUID-shaped, optional `etp_rt=` prefix) |
| `CR_EMAIL`                   |    —     | Legacy Crunchyroll email. Password grant is no longer accepted; kept only as fallback                     |
| `CR_PASSWORD`                |    —     | Legacy Crunchyroll password. Use `CR_ETP_RT` instead                                                      |
| `CR_BASIC_AUTH`              |    —     | Optional AndroidTV Basic auth override. Leave empty to use auto-synced constants                          |
| `CR_USER_AGENT`              |    —     | Optional AndroidTV User-Agent override. Leave empty to use auto-synced constants                          |
| `CR_AUTO_UPDATE_CREDENTIALS` |    —     | Set `false` to disable daily AndroidTV credential sync. Default: `true`                                   |
| `U2_RSS_URL`                 |    —     | Full RSS URL dari U2 BDMV (termasuk passkey). Feed dinonaktifkan jika kosong                              |
| `AMENZB_API_KEY`             |    —     | API key dari [amenzb.moe](https://amenzb.moe/profile)                                                     |
| `TOKEN_ENCRYPTION_KEY`       |    ✅    | Kunci enkripsi token di database. Generate dengan: `openssl rand -hex 32`                                 |

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

### Crunchyroll `etp_rt`

Fitur account-scoped (pencarian series, episode, dan subtitle) memakai cookie `etp_rt`, bukan username/password.

1. Login ke [www.crunchyroll.com](https://www.crunchyroll.com) di browser.
2. Buka DevTools → Application/Storage → Cookies → `www.crunchyroll.com`.
3. Salin nilai cookie `etp_rt` (format UUID `8-4-4-4-12`).
4. Simpan ke env `CR_ETP_RT`. Boleh dengan prefix `etp_rt=...`.
5. Jangan tempel nilai cookie di chat, issue, atau log.

`CR_EMAIL` / `CR_PASSWORD` tetap diterima sebagai fallback legacy, tetapi Crunchyroll menolak `grant_type=password` sehingga jalur ini tidak lagi diandalkan.

## Deployment

Lihat [CONTRIBUTING.md](CONTRIBUTING.md) untuk panduan development dan deployment.

### Self-Hosting dengan Docker

`docker-compose.yml` (production) menggunakan external Docker network `yura-network`. Buat network ini sekali sebelum menjalankan bot:

```bash
docker network create yura-network
```

Lalu jalankan bot:

```bash
docker compose up -d
```

Untuk development lokal, gunakan `docker-compose.dev.yml` yang sudah self-contained (tidak butuh external network):

```bash
docker compose -f docker-compose.dev.yml up
```

## License

[MIT](LICENSE)
