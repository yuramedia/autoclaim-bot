---
description: TypeScript best practices and patterns
activation: glob
glob: "**/*.ts"
---

# TypeScript Rules

## Type Safety
- Avoid using `any` type - prefer `unknown` if type is truly unknown
- Always define return types for functions
- Use interfaces for object shapes, types for unions/primitives
- Enable strict mode in tsconfig.json

## Async/Await
- Always use try/catch for async operations
- Prefer async/await over raw Promises
- Handle promise rejections appropriately

## Imports
- Use ES module imports (`import`/`export`)
- Group imports: external packages first, then internal modules
- Use type-only imports when possible: `import type { X } from 'y'`

## Naming Conventions
- camelCase for variables and functions
- PascalCase for interfaces, types, and classes
- UPPER_SNAKE_CASE for constants
- Prefix interfaces with `I` only if needed for clarity

## Error Handling
- Create custom error classes for domain-specific errors
- Always log errors with stack traces
- Return user-friendly error messages in Discord responses
