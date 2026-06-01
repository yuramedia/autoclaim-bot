# Changelog

Semua perubahan penting pada proyek ini didokumentasikan di sini.

Format mengikuti [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Fixed

- **`TOKEN_ENCRYPTION_KEY` tidak terdokumentasi di README** — variabel wajib ini sekarang muncul di tabel Environment Variables dengan keterangan cara generate-nya
- **GitHub Actions menggunakan ref yang salah** — `deploy.yml` dan `pr.yml` menggunakan pinned version tags (`@v4`, `@v7`, dst.) yang tidak konsisten dengan pendekatan proyek. Semua `uses:` sekarang menggunakan mutable branch ref yang sudah diverifikasi via `git ls-remote` (`actions/checkout@main`, `docker/*@master`, `appleboy/*@master`, `oven-sh/setup-bun@main`)
- **`token-crypto.ts` baca `process.env.TOKEN_ENCRYPTION_KEY` langsung** — sekarang baca dari `config.security.tokenEncryptionKey` sesuai aturan CONTRIBUTING
- **`logger.ts` baca `process.env.NODE_ENV` langsung** — sekarang baca dari `config.env` sesuai aturan CONTRIBUTING
- **`docker-compose.yml` bergantung pada `yura-network` tanpa dokumentasi** — panduan `docker network create yura-network` ditambahkan ke README bagian Self-Hosting

### Added

- `config.env` — centralize `NODE_ENV` ke `src/config.ts`
- `src/test-setup.ts` — preload file untuk test runner (set env vars sebelum config.ts dievaluasi)
- `src/utils/token-crypto.test.ts` — unit tests untuk enkripsi/dekripsi token (round-trip, format, IV randomness, backward compat)
- Script `test` di `package.json`: `bun test --preload ./src/test-setup.ts`

### Removed

- `ecosystem.config.cjs` — file PM2 legacy yang sudah tidak dipakai sejak migrasi ke Docker; dihapus untuk menghindari kebingungan kontributor baru

- Inkonsistensi default `CLAIM_HOUR`: sekarang konsisten `0` di `config.ts` dan `.env.example`
- Validasi range `CLAIM_HOUR` (0–23) dan `CLAIM_MINUTE` (0–59) — nilai di luar range fallback ke `0`
- Pesan konfirmasi setup Hoyolab kini menampilkan waktu claim dinamis sesuai config, bukan hardcode `00:00 UTC+8`
- `scheduler.ts`: ganti semua `console.log`/`console.error` dengan `logger` (pino)
- `u2-feed-scheduler.ts`: ganti semua `console.*` dengan `logger`, baca URL dari `config` bukan `process.env` langsung
- `crunchyroll.ts`: baca `CR_EMAIL`/`CR_PASSWORD` dari `config.crunchyroll` bukan `process.env` langsung
- `languages.ts`: hapus duplikasi `cleanOverrides` yang identik dengan `LANG_MAP`, ganti `console.error` dengan `logger`
- `hoyolab-select.ts`: hapus duplikasi `formatGameName()` — gunakan `getGameDisplayName()` dari `constants/games`
- `amenzb.ts`: baca `AMENZB_API_KEY` dari `config.amenzb` bukan `process.env` langsung

### Added

- `LICENSE` file (MIT)
- `CONTRIBUTING.md` — panduan setup local dev dan alur PR
- `SECURITY.md` — cara melaporkan kerentanan dan best practices self-hosting
- `CHANGELOG.md` — file ini
- `docker-compose.dev.yml` — setup development lokal dengan MongoDB
- Semua env var (`CR_EMAIL`, `CR_PASSWORD`, `U2_RSS_URL`, `AMENZB_API_KEY`) sekarang terdokumentasi di `README.md`
- Semua 20 slash commands terdokumentasi di `README.md`

### Removed

- `test-amenzb.ts` (root) — file debug dengan API key hardcoded
- `src/test-u2-feed.ts` — file debug yang tertinggal di source produksi
- `CR_ETP_RT` dari semua referensi deploy pipeline

### Security

- `test-amenzb.ts` mengandung API key hardcoded (`AMENZB_API_KEY`) — file dihapus dan pattern `test-*.ts` ditambahkan ke `.gitignore`
- Centralisasi semua env var ke `src/config.ts` untuk mencegah `process.env` tersebar di seluruh codebase

---

## [Sebelum changelog ini]

Riwayat commit tersedia di [GitHub](https://github.com/yuramedia/autoclaim-bot/commits/main).
