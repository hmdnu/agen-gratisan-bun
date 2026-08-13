# Repository Guidelines

## Project Overview

agen-gratisan is a TypeScript/Node Discord bot that polls the Epic Games and Steam stores for free-game giveaways and posts rich-embed notifications to a configured Discord channel. Duplicate suppression is done via SQLite.

It is a deliberate 1:1 port of a Go codebase: module comments cite the original Go files (`cmd/bot/bot_test.go`, `internal/provider/epic/parser.go`, …) and code mirrors Go semantics (JSON decode behavior, RFC3339 formatting, byte-aware truncation). Preserve that fidelity when editing.

## Architecture & Data Flow

Boot chain: `src/main.ts` → `runBot()` in `src/bot.ts`, which constructor-injects `HTTPClient` (fetch wrapper), `DiscordClient`, and SQLite `State`, then starts a self-rearming `setTimeout` scheduler loop (`Scheduler.run(AbortSignal)`; abort = stop channel).

Each poll cycle:

1. `pollProviders()` calls `fetch()` on each provider (`EpicProvider`, `SteamProvider`).
2. Raw bytes are decoded by strict unknown-decoder functions: missing field → zero value, wrong type → throw (mirrors Go `json.Unmarshal`).
3. Providers filter to free games (Epic: `discountPercentage === 0`; Steam: `discount_percent === 100`).
4. Games not yet notified (`gameKey` = `Store:SourceID:FreeUntil` in RFC3339 UTC) are sent as embeds via `DiscordClient.sendGame()` and marked in the SQLite `notified_games` table (`INSERT OR IGNORE`).
5. The job returns the earliest provider `nextRun`; the scheduler sleeps until then, with `CHECK_INTERVAL` (default 6h) as fallback. Failed jobs retry after `retryIntervalMs`.

## Key Directories

| Path | Purpose |
|---|---|
| `src/main.ts` | Entry point; runs bot, exits 0/1 on error |
| `src/bot.ts` | Wiring: `runBot`, `pollProviders`, `gameKey`, `Notifier` interface |
| `src/config/` | `env.ts` (Env loading, `parseGoDuration`), `http.ts` (fetch wrapper) |
| `src/discord/` | `DiscordClient`, embed rendering (`gameEmbed`, `truncate`, `formatFreeUntil`) |
| `src/provider/` | `Provider`/`HTTPClient` interfaces; `epic/` and `steam/` subdirs (client, pure parser, response decoder) |
| `src/scheduler/` | `Scheduler` — self-rearming timer loop with retry |
| `src/notification/` | `State` — SQLite dedupe (open/has/mark/close) |
| `src/game/` | `Game` type |
| `src/util/` | Type guards (`isRecord`, `isString`, `isInteger`, `isArray`), `errorMessage` |
| `tests/` | **All** tests, centrally located (not colocated with sources) |

## Development Commands

```bash
bun install           # bun is the package manager (bun.lock)
bun run build         # tsc type-check → dist/ (rootDir src; src only)
bun run test          # vitest run — single run, no watch, no coverage config
bun run src/main.ts   # run the bot directly from TS source (no build step)
```

There is **no lint or format tooling**. `tsc` with `strict` + `noUnusedLocals`/`noUnusedParameters` is the quality gate.

## Code Conventions & Common Patterns

- **ESM only**: `"type": "module"`; relative imports always carry `.js` extension (`import { X } from "../bot.js"`) even though sources are `.ts`.
- **No `any`**: decode unknown API payloads with the type guards in `src/util/guards.ts`; decoder functions throw descriptive errors (`cannot unmarshal … into Data.Catalog.SearchStore`).
- **Port fidelity**: keep Go-mirrored behaviors — strict RFC3339 parsing (`RFC3339_RE`), UTF-8 byte-aware `truncate` (ellipsis `…`), Go duration grammar in `parseGoDuration`, error prefixes like `load .env:` / `send game notification:`.
- **Error handling**: wrap thrown errors with `errorMessage()` from `src/util/guards.js`; async failures propagate up and `main()` logs and exits non-zero.
- **Async patterns**: `Promise`-returning methods; idempotent `start()`; `ready()` promise for readiness; `AbortSignal` for cancellation (scheduler, sleep timers).
- **No DI framework**: constructor injection (`token`/`channelId` into `DiscordClient`, `HTTPClient` into providers); parsers are stateless pure functions.
- **Naming**: PascalCase types/interfaces, camelCase functions, `SCREAMING_SNAKE` module constants (`EMBED_COLOR`, `POLL_INTERVAL_MS`, `NOTIFICATION_STATE_PATH`).
- **State**: single SQLite DB at `sqlite.db` via `bun:sqlite` `Database`; marks are idempotent (`INSERT OR IGNORE`).

## Important Files

- `src/main.ts`, `src/bot.ts` — entry and wiring; `pollProviders(providers, client, state): Promise<Date | null>`, `gameKey(game)`, `NOTIFICATION_STATE_PATH = "sqlite.db"`
- `src/config/env.ts` — `Env` interface (`discordToken`, `discordChannelId`, `epicApiUrl`, `steamApiUrl`, `checkIntervalMs`); required vars throw at startup; `CHECK_INTERVAL` parses Go durations, default 6h
- `src/provider/provider.ts` — contracts: `HTTPClient { get(url): Promise<Uint8Array> }`, `Provider { fetch(): Promise<Game[]>; nextRun(now): Date | null }`
- `src/provider/epic/parser.ts`, `src/provider/steam/parser.ts` — pure free-game window logic; `src/provider/*/response.ts` — strict decoders
- `src/scheduler/scheduler.ts` — `Job = () => Promise<Date | null>`; retry + interval fallback semantics
- `src/notification/state.ts` — `State.open(path)`, `.has(key)`, `.mark(key)`, `.close()`
- `.env.example` — `DISCORD_TOKEN`, `DISCORD_CHANNEL_ID`, `EPIC_API_URL`, `STEAM_API_URL`, `CHECK_INTERVAL=6h` (`.env` is gitignored)
- `tsconfig.json` — `target ES2022`, `module/moduleResolution NodeNext`, `strict`, `rootDir src` → `outDir dist`, `include: ["src"]`

## Runtime/Tooling Preferences

- **Bun >= 1.0** (uses `bun:sqlite`), ESM only.
- **Bun** (`bun install`, `bun.lock`; no npm).
- **discord.js ^14** and **dotenv ^16** are the only runtime deps; dev deps are `typescript ^5`, `vitest ^3`, `@types/node ^22`, `@types/bun`.
- **vitest**: `vitest.config.ts` externalizes `bun:` modules (Vite's resolver does not know the `bun:` scheme; Bun loads them natively). Default discovery picks up `tests/**/*.test.ts`. `bunfig.toml` sets `[run] bun = true` so `bun run` scripts execute under Bun, not Node.
- `.gitignore`: `node_modules/`, `dist/`, `.env`, `sqlite.db` — `dist/` is build output, never edit by hand.

## Testing & QA

- All tests live in `tests/`, named `*.test.ts`, ported from the Go suite (header comments cite the original `_test.go`); they import sources via `../src/<mod>.js`.
- `bun run build` does **not** type-check tests (tsconfig includes `src` only) — vitest validates them at runtime. Run both before shipping.
- Patterns: `describe`/`it`; hand-rolled fakes (`FakeProvider`, `StubHTTPClient`, `RecordingNotifier`); temp state DBs via `mkdtempSync`; `waitForRuns()` polling helper for scheduler timing tests.
- **Known pre-existing failure**: `tests/env.test.ts` — the `loadEnv` block (4 tests) fails with `load .env: ENOENT` when a real `.env` exists at the repo root: `loadEnv`'s `existsSync(".env")` check sees it, but dotenv then resolves against the mocked `process.cwd()` temp dir. Environment-dependent; `parseGoDuration` (2 tests) passes. Don't assume a green suite until this is fixed.
- **Coverage**: no thresholds configured. Untested surfaces: `DiscordClient.sendGame/start/ready`, `HTTPClient.get`, `runBot`/`startDiscord`/`waitForDiscordReady`/`newPollJob`, `bestImageURL`, `EpicProvider.nextRun` (`truncate`/`formatFreeUntil` only indirectly via `gameEmbed`).
- Full suite currently: 33 passing, 4 failing (the env flake above), 10 files.
