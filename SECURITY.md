# Security Policy

## Scope

Proyek ini menyimpan **token/cookie sensitif** milik pengguna di MongoDB, termasuk:

- Cookie Hoyolab (`ltoken_v2`, `ltuid_v2`, `cookie_token_v2`)
- Token SKPORT/Endfield (`ACCOUNT_TOKEN`)

Keamanan data pengguna adalah prioritas utama.

## Melaporkan Kerentanan

Jika kamu menemukan kerentanan keamanan, **jangan buat issue publik**.

Kirim laporan ke: **security@yuramedia.dev** (atau hubungi maintainer langsung via Discord)

Sertakan:

- Deskripsi kerentanan
- Langkah reproduksi
- Dampak potensial
- (Opsional) Saran perbaikan

Kami akan merespons dalam **72 jam** dan memberikan update berkala sampai masalah terselesaikan.

## Best Practices untuk Self-Hosting

Jika kamu menjalankan bot ini sendiri:

1. **Jangan commit `.env` atau `.env.production`** ke repository — keduanya sudah ada di `.gitignore`.
2. **Batasi akses MongoDB** — gunakan authentication dan network whitelist. Jangan expose port MongoDB ke publik.
3. **Rotasi token** secara berkala — Hoyolab token bisa expire; regenerate jika ada aktivitas mencurigakan.
4. **Amankan server** — jalankan bot di lingkungan yang tidak accessible publik jika memungkinkan.
5. **AMENZB_API_KEY** — pin IP bot di _Account Settings → IP Security_ di amenzb.moe untuk mencegah penyalahgunaan.
6. **Jangan hardcode secret** di source code — selalu gunakan environment variables melalui `config.ts`.

## Token Storage

Token disimpan di MongoDB dengan enkripsi at-rest bergantung konfigurasi MongoDB Anda. Pertimbangkan menggunakan [MongoDB Encryption at Rest](https://www.mongodb.com/docs/manual/core/security-encryption-at-rest/) untuk deployment produksi.
