// Port of internal/provider/epic/provider_test.go: fetch mapping and failures.
import { describe, expect, it } from "vitest";
import type { Game } from "../src/game/game.js";
import type { HTTPClient } from "../src/provider/provider.js";
import { EpicProvider } from "../src/provider/epic/epic.js";

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

const epicFixture = `{
  "data": {
    "Catalog": {
      "searchStore": {
        "elements": [
          {
            "title": "Free Game One",
            "id": "game-id-1",
            "namespace": "ns1",
            "description": "A free game for testing.",
            "offerType": "BASE_GAME",
            "productSlug": "cardpocalypse/home",
            "urlSlug": "cardpocalypsegeneralaudience",
            "catalogNs": {
              "mappings": [
                {"pageSlug": "cardpocalypse", "pageType": "productHome"}
              ]
            },
            "offerMappings": [
              {"pageSlug": "cardpocalypse-offer", "pageType": "offer"}
            ],
            "keyImages": [
              {"type": "OfferImageWide", "url": "https://cdn.example.com/wide.jpg"}
            ],
            "price": {"totalPrice": {"discountPrice": 0, "originalPrice": 1999, "currencyCode": "USD"}},
            "promotions": {
              "promotionalOffers": [
                {"promotionalOffers": [
                  {"startDate": "2020-01-01T00:00:00Z", "endDate": "2099-12-31T00:00:00Z",
                   "discountSetting": {"discountType": "PERCENTAGE", "discountPercentage": 0}}
                ]}
              ]
            }
          },
          {
            "title": "Paid Game",
            "id": "game-id-2",
            "namespace": "ns2",
            "productSlug": "paid-game",
            "catalogNs": {"mappings": null},
            "offerMappings": null,
            "promotions": {
              "promotionalOffers": [
                {"promotionalOffers": [
                  {"startDate": "2020-01-01T00:00:00Z", "endDate": "2099-12-31T00:00:00Z",
                   "discountSetting": {"discountType": "PERCENTAGE", "discountPercentage": 20}}
                ]}
              ]
            }
          }
        ]
      }
    }
  }
}`;

function encodeFixture(fixture: string): Uint8Array {
  return new TextEncoder().encode(fixture);
}

describe("EpicProvider", () => {
  it("fetch returns the current free games", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture(epicFixture);
    const provider = new EpicProvider(client, "https://store.epicgames.com/api");

    const got = await provider.fetch();
    expect(got).toHaveLength(1);

    const want: Game = {
      title: "Free Game One",
      store: "Epic Games",
      url: "https://store.epicgames.com/en-US/p/cardpocalypse",
      description: "A free game for testing.",
      imageUrl: "https://cdn.example.com/wide.jpg",
      freeUntil: new Date("2099-12-31T00:00:00Z"),
      sourceId: "ns1:game-id-1",
    };
    expect(got[0].title).toBe(want.title);
    expect(got[0].store).toBe(want.store);
    expect(got[0].url).toBe(want.url);
    expect(got[0].description).toBe(want.description);
    expect(got[0].imageUrl).toBe(want.imageUrl);
    expect(got[0].freeUntil?.getTime()).toBe(want.freeUntil?.getTime());
    expect(got[0].sourceId).toBe(want.sourceId);
  });

  it("fetch returns an error on HTTP failure", async () => {
    const client = new StubHTTPClient();
    client.err = new Error("network down");
    const provider = new EpicProvider(client, "https://store.epicgames.com/api");

    await expect(provider.fetch()).rejects.toThrow();
  });

  it("fetch returns an error on malformed response", async () => {
    const client = new StubHTTPClient();
    client.data = encodeFixture("{not json");
    const provider = new EpicProvider(client, "https://store.epicgames.com/api");

    await expect(provider.fetch()).rejects.toThrow();
  });
});
