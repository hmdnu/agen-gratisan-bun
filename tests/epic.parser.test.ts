// Port of internal/provider/epic/parser_test.go: promotion-window logic.
import { describe, expect, it } from "vitest";
import { currentFreeGameReleases, nextFreeGameStart } from "../src/provider/epic/parser.js";
import type { EpicElement, EpicResponse, Promotion, Promotions } from "../src/provider/epic/response.js";

function promotion(start: Date, discount: number): Promotion {
  return {
    startDate: start.toISOString(),
    endDate: new Date(start.getTime() + 60 * 60 * 1000).toISOString(),
    discountSetting: { discountType: "", discountPercentage: discount },
  };
}

function element(promotions: Promotions | null, title = ""): EpicElement {
  return {
    title,
    id: "",
    namespace: "",
    description: "",
    offerType: "",
    productSlug: null,
    urlSlug: "",
    keyImages: [],
    promotions,
    catalogNs: null,
    offerMappings: [],
  };
}

function responseWithElements(elements: EpicElement[]): EpicResponse {
  return { elements };
}

describe("nextFreeGameStart", () => {
  it("finds the earliest upcoming free promotion", () => {
    const now = new Date(Date.UTC(2026, 7, 10, 12, 0, 0));
    const response = responseWithElements([
      element({
        promotionalOffers: [
          {
            promotionalOffers: [
              promotion(new Date(now.getTime() + 2 * 60 * 60 * 1000), 0),
              promotion(new Date(now.getTime() + 30 * 60 * 1000), 50),
            ],
          },
        ],
        upcomingPromotionalOffers: [
          {
            promotionalOffers: [promotion(new Date(now.getTime() + 60 * 60 * 1000), 0)],
          },
        ],
      }),
    ]);

    const got = nextFreeGameStart(response, now);
    expect(got?.getTime()).toBe(now.getTime() + 60 * 60 * 1000);
  });
});

describe("currentFreeGameReleases", () => {
  it("filters inactive and paid promotions", () => {
    const now = new Date(Date.UTC(2026, 7, 10, 12, 0, 0));
    const response = responseWithElements([
      element(
        {
          promotionalOffers: [
            {
              promotionalOffers: [promotion(new Date(now.getTime() - 30 * 60 * 1000), 0)],
            },
          ],
          upcomingPromotionalOffers: [],
        },
        "Free game",
      ),
      element(
        {
          promotionalOffers: [
            {
              promotionalOffers: [promotion(new Date(now.getTime() - 30 * 60 * 1000), 20)],
            },
          ],
          upcomingPromotionalOffers: [],
        },
        "Paid game",
      ),
    ]);

    const got = currentFreeGameReleases(response, now);
    expect(got).toHaveLength(1);
    expect(got[0].element.title).toBe("Free game");
  });
});
