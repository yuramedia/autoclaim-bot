---
name: U2 BDMV Feed
description: Implementation patterns for U2 RSS feed monitoring and Discord notifications
---

# U2 BDMV Feed Skill

RSS feed monitoring for U2 (u2.dmhy.org) BDMV releases → Discord notifications.

## Architecture

```
U2 RSS Feed → u2-feed.ts (native XML parse) → u2-feed-scheduler.ts (poll & post) → Discord
```

### Files

| File                                   | Purpose                                              |
| -------------------------------------- | ---------------------------------------------------- |
| `src/types/u2-feed.ts`                 | `U2FeedItem`, `FormattedU2Item`, `IU2FeedSettings`   |
| `src/constants/u2-feed.ts`             | Poll interval, colors, icon, image/passkey patterns  |
| `src/services/u2-feed.ts`              | `U2FeedService` — native XML parsing, image extract  |
| `src/services/u2-feed-scheduler.ts`    | Polling scheduler, Discord embed builder, cross-post |
| `src/commands/u2-feed.ts`              | `/u2-feed` command (enable/disable/status)           |
| `src/database/models/GuildSettings.ts` | `IU2FeedSettings` schema embedded in guild settings  |

## Key Design Patterns (from Rimuru-Bot)

### Native XML Parsing

No `rss-parser` dependency for U2 — uses `fetch` + regex to extract `<item>` blocks from RSS XML. HTML entities decoded via `he` package.

### Item Equality

For U2, items match on **link OR title** (case-insensitive). This handles U2's behavior where the same torrent can reappear with a different hash.

### wasPosted Tracking

Each cached item has a `wasPosted` flag. On first run, all items are cached with `wasPosted = true` (silent). Only subsequent new items get posted.

### First-Run 24h Skip

Items older than 24 hours are skipped on the first check to avoid spamming stale content.

### Cross-Posting

After sending an embed, `message.crosspost()` is called for announcement channels.

## Configuration

### Environment Variables

- `U2_RSS_URL` — Full U2 RSS URL with passkey and filters, e.g.:
    ```
    U2_RSS_URL=https://u2.dmhy.org/torrentrss.php?rows=50&cat16=1&icat=1&ismalldescr=1&isize=1&iuplder=1&trackerssl=1&passkey=YOUR_PASSKEY
    ```

### Per-Guild Settings

Guilds configure via `/u2-feed enable #channel [filter]`:

- **channel** — text channel for notifications
- **filter** — regex pattern (default: `BDMV|Blu-ray|BD-BOX`)

## Scheduler Behavior

- **Poll interval**: 10 minutes
- **First run**: caches items silently (wasPosted = true), skips items >24h old
- **Subsequent runs**: posts new items matching the guild's filter regex
- **Cache**: in-memory array of `FormattedU2Item`, capped at 50, sorted by pubDate desc
- **Shard-safe**: only runs on shard 0
