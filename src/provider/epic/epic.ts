import type { Game } from "../../game/game.js";
import { errorMessage } from "../../util/guards.js";
import type { HTTPClient, Provider } from "../provider.js";
import { currentFreeGameReleases, nextFreeGameStart, parseEpicResponse } from "./parser.js";
import type { FreeGameRelease } from "./parser.js";
import type { EpicElement, EpicResponse, KeyImage } from "./response.js";

export class EpicProvider implements Provider {
  // Cached for NextRun; single scheduler caller, no lock needed.
  private lastResponse: EpicResponse | null = null;

  constructor(
    private readonly client: HTTPClient,
    private readonly apiUrl: string,
  ) {}

  async fetch(): Promise<Game[]> {
    let data: Uint8Array;
    try {
      data = await this.client.get(this.apiUrl);
    } catch (err) {
      throw new Error("fetch Epic games: " + errorMessage(err));
    }
    let response: EpicResponse;
    try {
      response = parseEpicResponse(data);
    } catch (err) {
      throw new Error("parse Epic games: " + errorMessage(err));
    }
    this.lastResponse = response;

    const releases = currentFreeGameReleases(response, new Date());
    return releases.map(toGame);
  }

  nextRun(now: Date): Date | null {
    return this.lastResponse === null ? null : nextFreeGameStart(this.lastResponse, now);
  }
}

/** Maps an Epic release into the shared notification payload. */
export function toGame(release: FreeGameRelease): Game {
  const element = release.element;
  return {
    title: element.title,
    store: "Epic Games",
    url: storeURL(element),
    description: element.description,
    imageUrl: bestImageURL(element.keyImages),
    freeUntil: release.endDate,
    sourceId: element.namespace + ":" + element.id,
  };
}

/** Builds the Epic store page, preferring canonical productHome mappings with legacy slug fallback. */
export function storeURL(element: EpicElement): string {
  let slug = "";
  for (const mapping of element.catalogNs?.mappings ?? []) {
    if (mapping.pageType === "productHome" && mapping.pageSlug !== "") {
      slug = mapping.pageSlug;
      break;
    }
  }
  if (slug === "") {
    for (const mapping of element.offerMappings) {
      if (mapping.pageType === "productHome" && mapping.pageSlug !== "") {
        slug = mapping.pageSlug;
        break;
      }
    }
  }
  if (slug === "") {
    slug = element.productSlug ?? "";
    if (slug === "") {
      slug = element.urlSlug;
    }
  }
  if (slug === "") {
    return "";
  }
  return "https://store.epicgames.com/en-US/p/" + slug;
}

/** Picks the widest available key image for the embed. */
export function bestImageURL(images: KeyImage[]): string {
  const rank: Record<string, number> = { OfferImageWide: 2, Dalle2Image: 1 };

  let best = "";
  let bestRank = 0;
  for (const image of images) {
    if (image.url === "") {
      continue;
    }
    if (best === "") {
      best = image.url;
    }
    if (rank[image.type] > bestRank) {
      best = image.url;
      bestRank = rank[image.type];
    }
  }
  return best;
}
