---
description: Code organization and architecture standards for the project
---

# Code Organization Standards

## Directory Structure

- **src/constants/**: All constant values, configuration objects, and enums must be placed here.
    - Do NOT define constants inline within services or commands if they are used in multiple places or are configuration-like.
    - Create specific files for domains (e.g., `games.ts`, `languages.ts`) and export them via `index.ts`.

- **src/types/**: All TypeScript interfaces, types, and enums must be placed here.
    - Do NOT define interfaces inline within implementation files.
    - Create specific files for domains matching the constants or services (e.g., `crunchyroll.ts`, `embed.ts`).

- **src/services/**: Core business logic and API interactions.
    - Services should be classes or collections of functions that handle specific external APIs or internal logic.
    - Services must import types from `src/types` and constants from `src/constants`.

- **src/commands/**: Discord slash command definitions.
    - Commands should focus on interaction handling and delegate logic to services.

## Naming Conventions

- **Files**: Use kebab-case for filenames (e.g., `embed-builder.ts`, `crunchyroll-scheduler.ts`).
- **Classes/Interfaces**: Use PascalCase (e.g., `CrunchyrollService`, `AnimeRelease`).
- **Variables/Functions**: Use camelCase (e.g., `fetchEpisodes`, `isValid`).
- **Constants**: Use SCREAMING_SNAKE_CASE for global constants (e.g., `GAME_DISPLAY_NAMES`).

## Exports

- Use **Barrel Files** (`index.ts`) in `constants` and `types` directories to simplify imports.
- Prefer named exports over default exports.

## JSDoc

- All public methods, classes, and exported functions must have JSDoc comments explaining their purpose, parameters, and return references.
