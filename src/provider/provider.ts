import type { Game } from "../game/game.js";

/** Fetches raw provider payloads. */
export interface HTTPClient {
  get(url: string): Promise<Uint8Array>;
}

/** Fetches current free games from one store. */
export interface Provider {
  fetch(): Promise<Game[]>;
  /**
   * Returns when this provider wants to be polled next;
   * null means no scheduled wake, so the caller uses its default interval.
   */
  nextRun(now: Date): Date | null;
}
