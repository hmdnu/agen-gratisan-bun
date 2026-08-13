// Port of internal/provider/steam/provider_test.go: fetch mapping and failures.
import { describe, expect, it } from "vitest";
import type { Game } from "../src/game/game.js";
import type { HTTPClient } from "../src/provider/provider.js";
import { SteamProvider } from "../src/provider/steam/steam.js";

class StubHTTPClient implements HTTPClient {
  data: Uint8Array = new Uint8Array();
  err: Error | null = null;

  async get(_url: string): Promise<Uint8Array> {
    if (this.err !== null) {
      throw this.err;
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

const API_URL = "https://store.steampowered.com/api/featuredcategories?cc=us&l=english";

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
});
