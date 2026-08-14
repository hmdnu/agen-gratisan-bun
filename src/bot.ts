// Application wiring: runBot, pollProviders, gameKey — the TS counterpart of
// cmd/bot/bot.go.
import { HTTPClient } from "./config/http.js";
import { loadEnv } from "./config/env.js";
import { DiscordClient } from "./discord/client.js";
import type { Game } from "./game/game.js";
import { State } from "./notification/state.js";
import { EpicProvider } from "./provider/epic/epic.js";
import type { Provider } from "./provider/provider.js";
import { SteamProvider } from "./provider/steam/steam.js";
import { Scheduler } from "./scheduler/scheduler.js";
import type { Job } from "./scheduler/scheduler.js";
import { errorMessage } from "./util/guards.js";

export const NOTIFICATION_STATE_PATH = "sqlite.db";

/** Posts free-game notifications to Discord. */
export interface Notifier {
  sendGame(game: Game): Promise<void>;
}

export async function runBot(): Promise<void> {
  const env = loadEnv();

  const state = State.open(NOTIFICATION_STATE_PATH);
  try {
    const httpClient = new HTTPClient();
    const client = new DiscordClient(env.discordToken, env.discordChannelId);

    const startPromise = startDiscord(client);
    await waitForDiscordReady(client, startPromise);

    const providers: Provider[] = [
      new EpicProvider(httpClient, env.epicApiUrl),
      new SteamProvider(httpClient, env.steamApiUrl, env.steamWatchAppids),
    ];
    const stop = new AbortController();
    new Scheduler(
      env.checkIntervalMs,
      newPollJob(providers, client, state),
    ).run(stop.signal);

    await startPromise;
    stop.abort();
  } finally {
    state.close();
  }
}

export function startDiscord(client: DiscordClient): Promise<void> {
  return client.start();
}

// Port of the Go select race between Start's error channel and Ready().
export function waitForDiscordReady(
  client: DiscordClient,
  startPromise: Promise<void>,
): Promise<void> {
  return Promise.race([
    startPromise.then(
      () => {
        throw new Error("Discord client stopped before becoming ready");
      },
      (err: unknown) => {
        throw err;
      },
    ),
    client.ready(),
  ]);
}

export function newPollJob(
  providers: Provider[],
  client: Notifier,
  state: State,
): Job {
  return () => pollProviders(providers, client, state);
}

// pollProviders fetches every provider, notifies new free games, and returns
// the earliest requested wake time (null = scheduler default interval).
export async function pollProviders(
  providers: Provider[],
  client: Notifier,
  state: State,
): Promise<Date | null> {
  const now = new Date();
  let nextRun: Date | null = null;

  for (const p of providers) {
    let games: Game[];
    try {
      games = await p.fetch();
    } catch (err) {
      console.error("provider fetch failed: " + errorMessage(err));
      games = [];
    }
    for (const game of games) {
      const key = gameKey(game);
      const notified = state.has(key);
      if (notified) {
        continue;
      }
      await client.sendGame(game);
      state.mark(key);
    }
    // Consult nextRun even when fetch failed so fixed-cadence providers
    // (Steam) retry promptly after transient errors. Epic's stale cached
    // response may still report a future promo start, but Steam's 30-minute
    // wake always wins the earliest-wake comparison, so polling continues
    // regardless of which provider is failing.
    const wake = p.nextRun(now);
    if (
      wake !== null &&
      (nextRun === null || wake.getTime() < nextRun.getTime())
    ) {
      nextRun = wake;
    }
  }
  return nextRun;
}

// gameKey identifies a free-game offer for duplicate suppression. An offer
// without an expiry (zero FreeUntil) collapses to one permanent key per store
// offer; a repeat window without an expiration is treated as already notified,
// matching permanently-free behavior (Steam specials always carry an
// expiration in practice).
export function gameKey(game: Game): string {
  return game.store + ":" + game.sourceId + ":" + formatRfc3339(game.freeUntil);
}

// Formats a Date in Go RFC3339 (no trailing zero fraction, "Z" for UTC); the
// Go zero time.Time formats as the literal year-1 stamp.
export function formatRfc3339(d: Date | null): string {
  if (d === null) {
    return "0001-01-01T00:00:00Z";
  }
  const iso = d.toISOString(); // always "YYYY-MM-DDTHH:mm:ss.sssZ"
  const dot = iso.indexOf(".");
  const seconds = iso.slice(0, dot);
  let fraction = iso.slice(dot + 1, iso.length - 1);
  fraction = fraction.replace(/0+$/, "");
  return fraction === "" ? seconds + "Z" : seconds + "." + fraction + "Z";
}
