---
name: U2 BDMV Feed
description: Implementation patterns for U2 RSS feed monitoring and Discord notifications
---

# U2 BDMV Feed Skill

RSS feed monitoring for U2 (u2.dmhy.org) BDMV releases → Discord notifications.

## Architecture

```
U2 RSS Feed → u2-feed.ts (parse XML) → u2-feed-scheduler.ts (poll & post) → Discord
```

### Files

| File                                   | Purpose                                             |
| -------------------------------------- | --------------------------------------------------- |
| `src/types/u2-feed.ts`                 | `U2FeedItem`, `FormattedU2Item`, `IU2FeedSettings`  |
| `src/constants/u2-feed.ts`             | Poll interval, colors, icon, image regex patterns   |
| `src/services/u2-feed.ts`              | `U2FeedService` — RSS XML parsing, image extraction |
| `src/services/u2-feed-scheduler.ts`    | Polling scheduler, Discord embed builder            |
| `src/commands/u2-feed.ts`              | `/u2-feed` command (enable/disable/status)          |
| `src/database/models/GuildSettings.ts` | `IU2FeedSettings` schema embedded in guild settings |

## Configuration

### Environment Variables

- `U2_RSS_URL` — Full U2 RSS URL with passkey and filters, e.g.:
    ```
    U2_RSS_URL=https://u2.dmhy.org/torrentrss.php?rows=50&cat16=1&icat=1&ismalldescr=1&isize=1&iuplder=1&trackerssl=1&passkey=YOUR_PASSKEY
    ```

### U2 RSS Parameters

| Param           | Meaning                      |
| --------------- | ---------------------------- |
| `rows=50`       | Number of items to fetch     |
| `cat16=1`       | Filter category 16 (BDMV)    |
| `icat=1`        | Include category in response |
| `ismalldescr=1` | Include small description    |
| `isize=1`       | Include file size            |
| `iuplder=1`     | Include uploader name        |
| `trackerssl=1`  | Use SSL for tracker          |

### Per-Guild Settings

Guilds configure via `/u2-feed enable #channel [filter]`:

- **channel** — text channel for notifications
- **filter** — regex pattern (default: `BDMV|Blu-ray|BD-BOX`)

## RSS XML Structure

Each `<item>` contains:

```xml
<title><![CDATA[[BDMV][Title][Info][Size][Uploader]]]></title>
<link>https://u2.dmhy.org/details.php?id=XXXXX</link>
<description><![CDATA[<html with images and BD info>]]></description>
<author><![CDATA[user@u2.dmhy.org (user)]]></author>
<category domain="...">BDMV</category>
<enclosure url="download_url" length="size_bytes" type="application/x-bittorrent" />
<guid isPermaLink="false">torrent_hash</guid>
<pubDate>RFC 2822 date</pubDate>
```

## Image Extraction

Description HTML contains `<img>` tags. The service:

1. Looks for `src="..."` in img tags (`.jpg`, `.png`, `.gif`, `.webp`)
2. Handles U2 attachment paths (`attachments/YYYYMM/...`) by prefixing `https://u2.dmhy.org/`
3. Falls back to general URL pattern matching

## Scheduler Behavior

- **Poll interval**: 10 minutes
- **First run**: populates cache silently (no notifications)
- **Subsequent runs**: posts new items matching the guild's filter regex
- **Cache**: in-memory `Set<string>` of GUIDs, capped at 500
- **Rate limit**: max 10 items per cycle per guild, 1s delay between messages
- **Shard-safe**: only runs on shard 0
