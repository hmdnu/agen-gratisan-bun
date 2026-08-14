// Port of internal/provider/steam/provider_test.go: fetch mapping and failures.
import { describe, expect, it } from "vitest";
import type { Game } from "../src/game/game.js";
import type { HTTPClient } from "../src/provider/provider.js";
import { SteamProvider } from "../src/provider/steam/steam.js";

const API_URL = "https://store.steampowered.com/api/featuredcategories?cc=us&l=english";

// The free-promo search URL derives from API_URL; EMPTY_SEARCH_PAGE models
// "no current free promos" so tests not targeting the search source never
// hit the real search path.
const SEARCH_URL = "https://store.steampowered.com/search/?cc=us&l=english&specials=1&maxprice=free";
const EMPTY_SEARCH_PAGE = '<div id="search_result_container"></div>';

class StubHTTPClient implements HTTPClient {
  data: Uint8Array = new Uint8Array();
  byUrl: Record<string, Uint8Array> = {};
  err: Error | null = null;

  async get(url: string): Promise<Uint8Array> {
    if (this.err !== null) {
      throw this.err;
    }
    if (url in this.byUrl) {
      return this.byUrl[url];
    }
    // Any un-stubbed free-promo search URL (including later pages of a
    // paginated result) has no promos; tests targeting the search source
    // override SEARCH_URL in byUrl.
    if (url.startsWith(SEARCH_URL)) {
      return new TextEncoder().encode(EMPTY_SEARCH_PAGE);
    }
    return this.data;
  }
}

const steamFixture = `{
  "specials": {
    "items": [
      {
        "id": 480,
        "name": "Free Game",
        "discount_percent": 100,
        "discount_expiration": 4102444800,
        "header_image": "https://cdn.example.com/header.jpg",
        "large_capsule_image": "https://cdn.example.com/capsule.jpg"
      },
      {
        "id": 481,
        "name": "Discounted Game",
        "discount_percent": 50,
        "discount_expiration": 4102444800,
        "header_image": "https://cdn.example.com/discounted.jpg"
      }
    ]
  }
}`;

function encodeFixture(fixture: string): Uint8Array {
  return new TextEncoder().encode(fixture);
}

// Search-page row mirroring the live markup (appid before class, capsule img first).
const searchPageFixture = `<div id="search_result_container">
  <a href="https://store.steampowered.com/app/214340/Deponia/" data-ds-appid="214340" class="search_result_row">
    <img src="https://cdn.example.com/capsule_231x87.jpg">
    <span class="title">Deponia</span>
    <div class="discount_block" data-discount="100"></div>
  </a>
</div>`;

describe("SteamProvider", () => {
  it("fetch returns only games discounted to 100%", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(steamFixture);
    const provider = new SteamProvider(client, API_URL);

    const got = await provider.fetch();
    expect(got).toHaveLength(1);

    const want: Game = {
      title: "Free Game",
      store: "Steam",
      url: "https://store.steampowered.com/app/480/",
      description: "",
      imageUrl: "https://cdn.example.com/header.jpg",
      freeUntil: new Date(4102444800 * 1000),
      sourceId: "480",
    };
    expect(got[0].title).toBe(want.title);
    expect(got[0].store).toBe(want.store);
    expect(got[0].url).toBe(want.url);
    expect(got[0].imageUrl).toBe(want.imageUrl);
    expect(got[0].freeUntil?.getTime()).toBe(want.freeUntil?.getTime());
    expect(got[0].sourceId).toBe(want.sourceId);
  });

  it("fetch returns an error on HTTP failure", async () => {
    const client = new StubHTTPClient();
    client.err = new Error("network down");
    const provider = new SteamProvider(client, API_URL);

    await expect(provider.fetch()).rejects.toThrow();
  });

  it("fetch returns an error on malformed response", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture("{not json");
    const provider = new SteamProvider(client, API_URL);

    await expect(provider.fetch()).rejects.toThrow();
  });

  it("nextRun schedules the next poll at the fixed cadence", () => {
    const provider = new SteamProvider(new StubHTTPClient(), API_URL);
    const now = new Date(Date.UTC(2026, 7, 12, 12, 0, 0));

    const wake = provider.nextRun(now);
    expect(wake?.getTime()).toBe(now.getTime() + 30 * 60 * 1000);
  });

  it("returns no games without the specials key", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(`{"coming_soon": {}}`);
    const provider = new SteamProvider(client, API_URL);

    const got = await provider.fetch();
    expect(got).toHaveLength(0);
  });

  it("falls back to the large capsule image", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(`{
      "specials": {"items": [
        {"id": 482, "name": "Capsule Game", "discount_percent": 100,
         "large_capsule_image": "https://cdn.example.com/capsule.jpg"}
      ]}
    }`);
    const provider = new SteamProvider(client, API_URL);

    const got = await provider.fetch();
    expect(got).toHaveLength(1);
    expect(got[0].imageUrl).toBe("https://cdn.example.com/capsule.jpg");
  });

  it("maps a missing discount_expiration to a null freeUntil", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(`{
      "specials": {"items": [
        {"id": 483, "name": "No Expiry", "discount_percent": 100,
         "header_image": "https://cdn.example.com/header.jpg"}
      ]}
    }`);
    const provider = new SteamProvider(client, API_URL);

    const got = await provider.fetch();
    expect(got).toHaveLength(1);
    expect(got[0].freeUntil).toBeNull();
  });

  it("merges a watchlisted app that is 100% off", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(`{"specials": {"items": []}}`);
    client.byUrl["https://store.steampowered.com/api/appdetails?cc=us&l=english&appids=214340"] = encodeFixture(
      `{"214340": {"success": true, "data": {
        "name": "Deponia",
        "header_image": "https://cdn.example.com/deponia.jpg",
        "capsule_image": "https://cdn.example.com/capsule.jpg",
        "price_overview": {"discount_percent": 100}
      }}}`,
    );
    const provider = new SteamProvider(client, API_URL, [214340]);

    const got = await provider.fetch();
    expect(got).toHaveLength(1);
    expect(got[0].title).toBe("Deponia");
    expect(got[0].url).toBe("https://store.steampowered.com/app/214340/");
    expect(got[0].sourceId).toBe("214340");
    expect(got[0].imageUrl).toBe("https://cdn.example.com/deponia.jpg");
    expect(got[0].freeUntil).toBeNull();
  });

  it("excludes a watchlisted app that is not 100% off", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(`{"specials": {"items": []}}`);
    client.byUrl["https://store.steampowered.com/api/appdetails?cc=us&l=english&appids=214340"] = encodeFixture(
      `{"214340": {"success": true, "data": {
        "name": "Deponia", "price_overview": {"discount_percent": 50}
      }}}`,
    );
    const provider = new SteamProvider(client, API_URL, [214340]);

    const got = await provider.fetch();
    expect(got).toHaveLength(0);
  });

  it("keeps featured games when a watchlisted app fails", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(steamFixture);
    client.byUrl["https://store.steampowered.com/api/appdetails?cc=us&l=english&appids=214340"] = encodeFixture(
      "{not json",
    );
    const provider = new SteamProvider(client, API_URL, [214340]);

    const got = await provider.fetch();
    expect(got).toHaveLength(1);
    expect(got[0].sourceId).toBe("480");
  });

  it("does not duplicate a watchlisted app already featured", async () => {
    const client = new StubHTTPClient();
    client.byUrl[API_URL] = encodeFixture(steamFixture);
    client.byUrl["https://store.steampowered.com/api/appdetails?cc=us&l=english&appids=480"] = encodeFixture(
      `{"480": {"success": true, "data": {
        "name": "Free Game", "price_overview": {"discount_percent": 100}
      }}}`,
    );
    const provider = new SteamProvider(client, API_URL, [480]);

    const got = await provider.fetch();
    expect(got).toHaveLength(1);
    expect(got[0].sourceId).toBe("480");
  });

  it("merges a free promo from the Steam search page", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(`{"specials": {"items": []}}`);
    client.byUrl[SEARCH_URL] = encodeFixture(searchPageFixture);
    const provider = new SteamProvider(client, API_URL);

    const got = await provider.fetch();
    expect(got).toHaveLength(1);
    expect(got[0].title).toBe("Deponia");
    expect(got[0].url).toBe("https://store.steampowered.com/app/214340/");
    expect(got[0].sourceId).toBe("214340");
    expect(got[0].imageUrl).toBe("https://cdn.example.com/capsule_231x87.jpg");
    expect(got[0].freeUntil).toBeNull();
  });

  it("keeps featured games when the search page fails", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(steamFixture);
    client.byUrl[SEARCH_URL] = encodeFixture("<html><body>error</body></html>");
    const provider = new SteamProvider(client, API_URL);

    const got = await provider.fetch();
    expect(got).toHaveLength(1);
    expect(got[0].sourceId).toBe("480");
  });

  it("does not duplicate a promo already featured or watchlisted", async () => {
    const client = new StubHTTPClient();
    client.byUrl[API_URL] = encodeFixture(steamFixture);
    client.byUrl["https://store.steampowered.com/api/appdetails?cc=us&l=english&appids=480"] = encodeFixture(
      `{"480": {"success": true, "data": {
        "name": "Free Game", "price_overview": {"discount_percent": 100}
      }}}`,
    );
    client.byUrl[SEARCH_URL] = encodeFixture(searchPageFixture.replaceAll("214340", "480"));
    const provider = new SteamProvider(client, API_URL, [480]);

    const got = await provider.fetch();
    expect(got).toHaveLength(1);
    expect(got[0].sourceId).toBe("480");
  });
});
