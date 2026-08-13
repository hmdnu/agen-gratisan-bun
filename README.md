# agen-gratisan

A Discord bot that posts free-game notifications for **Epic Games** and **Steam** to a configured channel, with SQLite-backed duplicate suppression so each free game is announced exactly once.

This is the TypeScript/Node.js port of the Go codebase (kept intact at the repository root). Behavior is identical: same polling, same dedup keys, same embed cards.

## Features

- **Epic Games** — posts games currently offered for free (100% discount) via the Epic Store free-games-promotions API.
- **Steam** — posts items currently discounted to **100%** in Steam's `featuredcategories` `specials` list (temporarily free, has an expiry; permanently free-to-play games are excluded).
- **Discord embeds** — each notification is a rich embed card with store link, image, and "free until" date.
- **Duplicate suppression** — SQLite state file (`sqlite.db`) ensures a game is announced once, even across retries or restarts.
- **In-process scheduler** — polling runs on a `setTimeout` timer loop; **no cron or external job runner needed**. Runs as a single long-lived process.
- **Always-running error policy** — a failure in one store never stops notifications from the other.

## Requirements

- Bun 1.0+ (uses the built-in `bun:sqlite` module)
- A Discord bot token with permission to post in the target channel

## Setup

1. Copy `.env.example` to `.env` and fill in the values:

   | Variable | Required | Default | Purpose |
   | --- | --- | --- | --- |
   | `DISCORD_TOKEN` | yes | — | Discord bot token |
   | `DISCORD_CHANNEL_ID` | yes | — | Channel that receives notifications |
   | `EPIC_API_URL` | yes | — | Epic free-games-promotions endpoint |
   | `STEAM_API_URL` | yes | — | Steam featuredcategories endpoint |
   | `CHECK_INTERVAL` | no | `6h` | Fallback poll interval (positive Go-style duration, e.g. `30m`, `1h30m`) |

   `.env` is optional: when present it is loaded, otherwise the bot falls back to process environment variables (e.g. a hosting panel's env-var settings). A required variable missing from both fails startup.

   Never commit `.env` — it is gitignored.

2. Install and run:

   ```bash
   bun install
   bun run src/main.ts
   ```

   The bot connects to Discord, then starts polling both stores immediately.

## How it works

Poll cycle (see `src/bot.ts`):

1. `pollProviders` calls `fetch` on each provider.
2. Each game not already in `sqlite.db` is sent as an embed and marked notified. `gameKey` identifies an offer as `Store:SourceID:FreeUntil` (UTC RFC3339); `SourceID` is `namespace:id` for Epic and the appid for Steam.
3. The job returns the **earliest** `nextRun` wake across providers; the scheduler sleeps until then. `CHECK_INTERVAL` is the fallback when no provider requests a wake.

### Scheduling

- **Epic** — `nextRun` returns the start of the next upcoming free promotion, so the bot wakes exactly when the new Epic free games go live.
- **Steam** — the API exposes no upcoming-start dates, so `nextRun` returns `now + 30m` (fixed cadence, `POLL_INTERVAL_MS` in `src/provider/steam/steam.ts`). A new 100%-off special is caught within 30 minutes of appearing in the featured list.
- The scheduler is a `setTimeout` loop in-process (`src/scheduler/scheduler.ts`) — the direct equivalent of the Go scheduler's `time.Timer` loop. No cron is required. The first poll runs immediately on start, so any game that went free while the bot was down is caught on boot.

### Providers

- **Epic** (`src/provider/epic`) — parses the store catalog response, keeps current free promotions (`discountPercentage == 0`), maps to `Game` with `sourceId = namespace:id`, and wakes at the next promotion start.
- **Steam** (`src/provider/steam`) — parses `specials.items[]`, keeps `discount_percent == 100`, maps with `sourceId = appid`, `freeUntil` from `discount_expiration`, image falls back from `header_image` to `large_capsule_image`. Limitation: the endpoint exposes only a ~10-item featured `specials` list, so a 100%-off promo that is not featured there is not seen; Steam cards carry no description (per-game enrichment is intentionally out of scope).

### Error policy

- Provider fetch failure — logged, that provider skipped for the cycle; the other provider still runs and notifies.
- Send/mark failure — thrown as an error; the scheduler logs and retries. Duplicate suppression makes retries safe (no double posts).
- The bot never exits on provider errors.

## Deployment

The bot is a single long-running process — a Discord-bot host only needs to keep it alive; **no cron support is required** because scheduling is in-process.

- Hosting on wispbyte.com: choose the **Bun** runtime (wispbyte runs Bun).
- Startup command: `bun install && bun run src/main.ts` — wispbyte runs `bun install` at boot with a CPU boost.
- Provide the five environment variables in the hosting panel, or upload `.env` to the deployment root via the file manager.
- Keep `sqlite.db` in the working directory on **persistent** storage — if storage is ephemeral, the dedup state resets and currently-listed games are re-notified after each restart.
- Outbound access required (all on port 443): Discord gateway (`wss`), `store.steampowered.com`, and the Epic API host.
- If the platform's `bun install` ever fails, upload `node_modules/` via SFTP from a linux x64 machine and use `bun run build && bun run src/main.ts` as the startup command.

## Development

```bash
bun run build       # type-check with tsc
bun run test        # run the vitest suite (vitest runs under Bun)
bun run src/main.ts # run the bot directly from TS source (no build step)
```

## Project structure

| Path | Purpose |
| --- | --- |
| `src/main.ts` | Executable entrypoint (`main` → `runBot`) |
| `src/bot.ts` | Application wiring (`runBot`, `pollProviders`, `gameKey`) |
| `src/config/` | Runtime configuration loading (`loadEnv`) and HTTP client |
| `src/game/` | Shared notification payload (`Game`) |
| `src/provider/` | `Provider` and `HTTPClient` interfaces |
| `src/provider/epic/` | Epic store provider |
| `src/provider/steam/` | Steam store provider |
| `src/discord/` | Discord client and embeds |
| `src/notification/` | SQLite duplicate-suppression state |
| `src/scheduler/` | In-process poll scheduler |

## Testing

Unit tests live in `tests/` (`*.test.ts`): provider contracts, Epic and Steam parsing/mapping, poll wiring, dedup state, scheduler timing, Discord embed formatting, and the duration parser. The suite is the direct port of the Go test suite.
