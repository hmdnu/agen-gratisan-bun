import type { Game } from "../../game/game.js";
import { errorMessage } from "../../util/guards.js";
import type { HTTPClient, Provider } from "../provider.js";
import { freeGames, parseAppDetails, parseSteamResponse, toGame } from "./parser.js";
import type { SteamItem } from "./response.js";
import { parseFreePromoPage } from "./search.js";

// Poll interval bounds how long a new free special can sit unseen in the
// featured list before the next fetch (Steam exposes no upcoming start dates,
// so the poll is on a fixed cadence instead of a scheduled wake).
const POLL_INTERVAL_MS = 30 * 60 * 1000;

// Cap on free-promo search pages fetched per poll (25 rows/page = 250 items).
// Steam never runs more concurrent free promos; the cap guards against an
// unbounded loop if pagination misbehaves.
const MAX_SEARCH_PAGES = 10;

export class SteamProvider implements Provider {
  constructor(
    private readonly client: HTTPClient,
    private readonly apiUrl: string,
    private readonly watchAppids: number[] = [],
  ) {}

  async fetch(): Promise<Game[]> {
    let data: Uint8Array;
    try {
      data = await this.client.get(this.apiUrl);
    } catch (err) {
      throw new Error("fetch Steam games: " + errorMessage(err));
    }
    const resp = parseSteamResponse(data);
    const games = freeGames(resp);

    // Watchlist: Steam's featured list omits some 100%-off promos (e.g.
    // Deponia), so poll appdetails for configured appids and merge any that
    // are currently free. A failing appid is logged and skipped so one stale
    // entry never blocks the rest of Steam notifications.
    const featuredIds = new Set(games.map((g) => g.sourceId));
    for (const appId of this.watchAppids) {
      if (featuredIds.has(String(appId))) {
        continue;
      }
      let item: SteamItem | null = null;
      try {
        item = parseAppDetails(await this.client.get(appDetailsUrl(this.apiUrl, appId)), appId);
      } catch (err) {
        console.error("fetch Steam watchlist app " + appId + ": " + errorMessage(err));
        continue;
      }
      if (item !== null && item.discountPercent === 100) {
        featuredIds.add(String(appId));
        games.push(toGame(item));
      }
    }

    // Free-promo search: the featured list is curated and can omit 100%-off
    // promos entirely (e.g. Deponia), so also poll Steam's search query
    // specials=1&maxprice=free, which enumerates every current temporary free
    // game. A failing search page is logged and skipped so featured/watchlist
    // notifications are never blocked.
    for (const game of await this.fetchFreePromos()) {
      if (featuredIds.has(game.sourceId)) {
        continue;
      }
      featuredIds.add(game.sourceId);
      games.push(game);
    }
    return games;
  }

  private async fetchFreePromos(): Promise<Game[]> {
    const games: Game[] = [];
    try {
      for (let page = 1; page <= MAX_SEARCH_PAGES; page++) {
        const items = parseFreePromoPage(await this.client.get(freePromoUrl(this.apiUrl, page)));
        if (items.length === 0) {
          break;
        }
        games.push(...items.map(toGame));
      }
    } catch (err) {
      console.error("fetch Steam search page: " + errorMessage(err));
    }
    return games;
  }

  // Schedules the next poll at a fixed cadence so new 100%-off specials are
  // caught shortly after they appear in the featured list.
  nextRun(now: Date): Date | null {
    return new Date(now.getTime() + POLL_INTERVAL_MS);
  }
}

/** Builds the appdetails URL for one appid, reusing the configured region/locale. */
function appDetailsUrl(apiUrl: string, appId: number): string {
  const url = new URL(apiUrl);
  url.pathname = "/api/appdetails";
  url.searchParams.set("appids", String(appId));
  return url.toString();
}

/** Builds the free-promo search URL, reusing the configured region/locale. */
function freePromoUrl(apiUrl: string, page: number): string {
  const url = new URL(apiUrl);
  url.pathname = "/search/";
  url.searchParams.set("specials", "1");
  url.searchParams.set("maxprice", "free");
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }
  return url.toString();
}
