import type { Game } from "../../game/game.js";
import { errorMessage } from "../../util/guards.js";
import type { HTTPClient, Provider } from "../provider.js";
import { freeGames, parseSteamResponse } from "./parser.js";

// Poll interval bounds how long a new free special can sit unseen in the
// featured list before the next fetch (Steam exposes no upcoming start dates,
// so the poll is on a fixed cadence instead of a scheduled wake).
const POLL_INTERVAL_MS = 30 * 60 * 1000;

export class SteamProvider implements Provider {
  constructor(
    private readonly client: HTTPClient,
    private readonly apiUrl: string,
  ) {}

  async fetch(): Promise<Game[]> {
    let data: Uint8Array;
    try {
      data = await this.client.get(this.apiUrl);
    } catch (err) {
      throw new Error("fetch Steam games: " + errorMessage(err));
    }
    const resp = parseSteamResponse(data);
    return freeGames(resp);
  }

  // Schedules the next poll at a fixed cadence so new 100%-off specials are
  // caught shortly after they appear in the featured list.
  nextRun(now: Date): Date | null {
    return new Date(now.getTime() + POLL_INTERVAL_MS);
  }
}
