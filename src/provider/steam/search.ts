// Steam search-page free-promo parsing: enumerates 100%-off promos that the
// curated featuredcategories `specials` list omits. Steam exposes no API that
// lists "currently free for a limited time", but the storefront search query
// specials=1&maxprice=free returns exactly those rows (verified live: the
// only row while Deponia is free). Rows carry no discount_expiration, so
// freeUntil is null and each promo notifies once.
import type { SteamItem } from "./response.js";

// Marker for the server-rendered search results container; its absence means
// the response is a captcha/interstitial/error page, not a search page.
const SEARCH_RESULTS_MARKER = 'id="search_result_container"';

// One search-result row. Capture order mirrors the live markup: the appid
// attribute precedes `class` in the anchor, and the capsule <img> is the
// first image in the row (a later img is a checkbox icon, not the capsule).
const ROW_RE = /<a[^>]*data-ds-appid="(\d+)"[\s\S]*?<img src="([^"]+)"[\s\S]*?<span class="title">([^<]*)<\/span>[\s\S]*?data-discount="(\d+)"[\s\S]*?<\/a>/g;

/** Parses the Steam search free-promo page into 100%-off items; [] when legitimately empty. */
export function parseFreePromoPage(data: Uint8Array): SteamItem[] {
  const html = Buffer.from(data).toString("utf8");
  if (!html.includes(SEARCH_RESULTS_MARKER)) {
    throw new Error("parse Steam search page: unexpected response");
  }
  const items: SteamItem[] = [];
  for (const m of html.matchAll(ROW_RE)) {
    const discountPercent = Number(m[4]);
    if (discountPercent !== 100) {
      continue;
    }
    items.push({
      id: Number(m[1]),
      name: m[3],
      discountPercent,
      discountExpiration: 0,
      headerImage: "",
      largeCapsuleImage: m[2],
    });
  }
  return items;
}
