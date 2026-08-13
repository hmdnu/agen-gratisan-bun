// Game represents a free-game notification payload.
export interface Game {
  title: string;
  store: string;
  url: string;
  description: string;
  imageUrl: string;
  /** null = Go zero time.Time (no expiry). */
  freeUntil: Date | null;
  /** Stable store-local offer identity: Epic = "namespace:id", Steam = appid. */
  sourceId: string;
}
