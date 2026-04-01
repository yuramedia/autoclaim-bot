---
name: Add New Game
description: Guide for adding a new game/service to the autoclaim-bot
version: 1.0.0
---

# Adding a New Game

Follow this checklist to integrate a new game into the bot.

## 1. Constants (`src/constants/`)

1.  **Open `src/constants/games.ts`**
    - Add the game key to `GAME_KEYS` (if applicable) or just use a string literal type.
    - Add the display name to `GAME_DISPLAY_NAMES`.
    - Add the icon to `GAME_ICONS`.
    - Add the color to `GAME_COLORS`.

2.  **Create `src/constants/<game>.ts`** (Optional)
    - If the game has specific constants (server variants, API URLs), create a dedicated file.
    - Export it in `src/constants/index.ts`.

## 2. Types (`src/types/`)

1.  **Create `src/types/<game>.ts`**
    - Define interfaces for API responses.
    - Define interfaces for configuration/auth.
    - **Do not** define types inline in services.

2.  **Export in `src/types/index.ts`**
    - `export * from "./<game>";`

## 3. Service (`src/services/`)

1.  **Create `src/services/<game>.ts`**
    - Implement a class (e.g., `GenshinService`) or set of functions.
    - Import types from `src/types`.
    - Import constants from `src/constants`.
    - Implement methods for `login`, `claim`, `getDailyReward`, etc.
    - Add JSDoc to all public methods.

## 4. Command (`src/commands/`)

1.  **Create `src/commands/setup-<game>.ts`** (if needed)
    - Command to set up credentials.
    - Save credentials to MongoDB (`User` model).

2.  **Create `src/commands/<game>.ts`** or add to generic `claim.ts`
    - If the game has unique mechanics, create a dedicated command.
    - Otherwise, integrate into the main claiming logic.

## 5. Scheduler (Optional)

1.  **Update `src/services/scheduler.ts`**
    - If the game supports auto-claim, add logic to the scheduler loop.
    - Ensure it respects user settings.

## Example: Adding "Zenless Zone Zero"

### `src/constants/games.ts`

```typescript
export const GAME_DISPLAY_NAMES = {
    // ...
    ZZZ: "Zenless Zone Zero"
};
```

### `src/types/zzz.ts`

```typescript
export interface ZZZReward {
    id: number;
    name: string;
    count: number;
}
```

### `src/services/zzz.ts`

```typescript
import { ZZZReward } from "../types/zzz";

export class ZZZService {
    async claimDaily_(): Promise<ZZZReward> {
        // ... implementation
    }
}
```
