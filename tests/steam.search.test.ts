// Steam search-page free-promo parsing.
import { describe, expect, it } from "vitest";
import { parseFreePromoPage } from "../src/provider/steam/search.js";

function encodeHtml(html: string): Uint8Array {
  return new TextEncoder().encode(html);
}

// Row structure mirrors the live search page: data-ds-appid precedes class in
// the anchor, the capsule img is the first image in the row.
const deponiaRow = `<a href="https://store.steampowered.com/app/214340/Deponia/" data-ds-appid="214340" data-ds-itemkey="App_214340" class="search_result_row ds_collapse_flag">
  <div class="search_capsule"><img src="https://cdn.example.com/capsule_231x87.jpg"></div>
  <div class="search_name ellipsis"><span class="title">Deponia</span></div>
  <div class="discount_block search_discount_block" data-price-final="0" data-discount="100">
    <div class="discount_pct">-100%</div>
  </div>
</a>`;

function pageWith(rows: string): string {
  return `<div id="search_result_container">${rows}</div>`;
}

describe("parseFreePromoPage", () => {
  it("parses a 100%-off row into a SteamItem", () => {
    const got = parseFreePromoPage(encodeHtml(pageWith(deponiaRow)));
    expect(got).toHaveLength(1);
    expect(got[0].id).toBe(214340);
    expect(got[0].name).toBe("Deponia");
    expect(got[0].discountPercent).toBe(100);
    expect(got[0].discountExpiration).toBe(0);
    expect(got[0].headerImage).toBe("");
    expect(got[0].largeCapsuleImage).toBe("https://cdn.example.com/capsule_231x87.jpg");
  });

  it("filters out rows that are not 100% off", () => {
    const row = deponiaRow.replace('data-discount="100"', 'data-discount="50"');
    expect(parseFreePromoPage(encodeHtml(pageWith(row)))).toHaveLength(0);
  });

  it("returns no items when the search is legitimately empty", () => {
    expect(parseFreePromoPage(encodeHtml(pageWith("")))).toHaveLength(0);
  });

  it("throws when the page is not a search results page", () => {
    expect(() => parseFreePromoPage(encodeHtml("<html><body>error</body></html>"))).toThrow(
      "parse Steam search page",
    );
  });
});
