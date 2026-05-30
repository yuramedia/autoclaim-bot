# Contributing

Terima kasih sudah mau berkontribusi! Panduan ini menjelaskan cara setup environment development dan alur pengiriman perubahan.

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.0
- MongoDB (lokal atau Atlas)
- Node.js ≥ 18 (untuk tooling, bukan runtime utama)

## Local Development

1. **Clone dan install dependencies**

    ```bash
    git clone https://github.com/yuramedia/autoclaim-bot.git
    cd autoclaim-bot
    bun install
    ```

2. **Setup environment**

    ```bash
    cp .env.example .env
    # Edit .env dengan value yang benar
    ```

3. **Jalankan dengan Docker Compose (direkomendasikan)**

    ```bash
    docker compose -f docker-compose.dev.yml up
    ```

    Ini akan menjalankan bot + MongoDB lokal sekaligus dengan hot-reload.

4. **Atau jalankan langsung**

    ```bash
    # Register slash commands (cukup sekali atau saat ada perubahan command)
    bun run deploy

    # Jalankan bot
    bun start
    ```

## Project Structure

```
src/
├── commands/       Slash command definitions & handlers
├── constants/      Static config, display names, API endpoints
├── core/           Discord client, logger, event bus (RAMEN)
├── database/       Mongoose models & connection
├── handlers/       Interaction, modal, select-menu handlers
├── services/       Business logic (Hoyolab, Crunchyroll, scheduler, …)
├── types/          TypeScript type definitions
└── utils/          Shared utilities (time, error-handler, stats)
```

## Code Style

Proyek menggunakan **OXC** untuk linting dan formatting:

```bash
# Lint
bun run lint

# Format
bun run fmt
```

Pastikan tidak ada lint error sebelum membuat PR.

## Pull Request

1. Fork repo dan buat branch dari `main`:
    ```bash
    git checkout -b feat/nama-fitur
    ```
2. Pastikan `bun run lint` lulus tanpa error.
3. Buat PR ke branch `main` dengan deskripsi yang jelas tentang perubahan.
4. CI akan otomatis menjalankan lint check dan Docker build check.

## Adding a New Game

Ikuti panduan di `.agents/skills/add-new-game/SKILL.md`.

## Environment Variables

Semua env var harus didefinisikan di `src/config.ts`. Jangan baca `process.env` langsung di service atau constants — selalu lewat `config`.
