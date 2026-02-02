---
description: Project-specific rules and conventions for autoclaim-bot
activation: always_on
---

# Autoclaim Bot Project Rules

## Project Overview
This is a Discord bot that provides auto-claim functionality for Hoyolab and Endfield games.

## Technology Stack
- **Runtime**: Bun
- **Framework**: Discord.js
- **Database**: MongoDB
- **Language**: TypeScript

## Code Conventions

### File Structure
- Commands go in `src/commands/`
- Services go in `src/services/`
- Event handlers go in `src/events/`
- Types/interfaces go in `src/types/`
- Utilities go in `src/utils/`

### Commands
- All slash commands should be in separate files under `src/commands/`
- Use the `SlashCommandBuilder` for defining commands
- Export `data` (command definition) and `execute` (handler function)

### Services
- Keep external API interactions in service files
- Services should be singleton or static class methods
- Handle errors gracefully and return meaningful error messages

### Environment Variables
- All secrets should be in `.env` file
- Reference `.env.example` for required variables
- Use `process.env.VARIABLE_NAME` for access

## Scripts
- `bun run dev` - Start development server
- `bun run build` - Build for production
- `bun run deploy` - Deploy slash commands to Discord
- `bun run test` - Run tests

## Best Practices
- Always handle Discord API rate limits
- Use embeds for rich message formatting
- Store user credentials securely in MongoDB
- Log errors with sufficient context for debugging
