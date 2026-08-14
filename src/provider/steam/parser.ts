// Steam parsing and mapping, a 1:1 port of internal/provider/steam/parser.go.
import type { Game } from "../../game/game.js";
import { errorMessage } from "../../util/guards.js";
import { decodeAppDetails, decodeSteamResponse } from "./response.js";
import type { SteamItem, SteamResponse } from "./response.js";

/** Decodes the Steam featuredcategories response. */
export function parseSteamResponse(data: Uint8Array): SteamResponse {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(data).toString("utf8"));
  } catch (err) {
    throw new Error("parse Steam response: " + errorMessage(err));
  }
  return decodeSteamResponse(raw);
}

/** Keeps only games currently discounted to 100%. */
export function freeGames(resp: SteamResponse): Game[] {
  const games: Game[] = [];
  for (const item of resp.items) {
    if (item.discountPercent !== 100) {
      continue;
    }
    games.push(toGame(item));
  }
  return games;
}

/** Decodes an appdetails response for one appid; null when the app has no data. */
export function parseAppDetails(data: Uint8Array, appId: number): SteamItem | null {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(data).toString("utf8"));
  } catch (err) {
    throw new Error("parse Steam response: " + errorMessage(err));
  }
  return decodeAppDetails(raw, appId);
}

export function toGame(item: SteamItem): Game {
  let freeUntil: Date | null = null;
  if (item.discountExpiration > 0) {
    freeUntil = new Date(item.discountExpiration * 1000);
  }
  let imageUrl = item.headerImage;
  if (imageUrl === "") {
    imageUrl = item.largeCapsuleImage;
  }
  return {
    title: item.name,
    store: "Steam",
    url: "https://store.steampowered.com/app/" + item.id + "/",
    imageUrl,
    freeUntil,
    sourceId: String(item.id),
    description: "",
  };
}
