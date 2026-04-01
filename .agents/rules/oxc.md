---
description: Rules for using Oxc tools (Oxfmt formatter and Oxlint linter) in this project
activation: always_on
---

# Oxc Tools Rules

This project uses **Oxfmt** for formatting and **Oxlint** for linting. Do **not** use Prettier or ESLint.

## Formatter — Oxfmt

Config file: `.oxfmtrc.json`

- Run: `bun run format` (writes in place)
- Check: `bun run format:check` (CI mode, no writes)
- Settings: `tabWidth: 4`, `printWidth: 120`, `trailingComma: "none"`, `arrowParens: "avoid"`

## Linter — Oxlint

Config file: `.oxlintrc.json`

- Run: `bun run lint`
- Auto-fix: `bun run lint:fix`
- Active plugins: `typescript`, `unicorn`, `oxc`
- Active categories: `correctness` (error), `suspicious` (warn)

### Disable Comments

Use `oxlint-disable` comments (not `eslint-disable`):

```typescript
// oxlint-disable-next-line no-unused-vars
const _unused = 1;

/* oxlint-disable typescript/no-explicit-any */
function foo(x: any) {}
/* oxlint-enable typescript/no-explicit-any */
```

### Adding Rules

To enable or configure individual rules, add them to the `"rules"` object in `.oxlintrc.json`:

```json
{
    "rules": {
        "no-console": "warn",
        "typescript/no-explicit-any": "error"
    }
}
```

## CI

Both tools must pass in CI before merging:

```bash
bunx oxfmt@latest --check
bunx oxlint@latest src/
```
