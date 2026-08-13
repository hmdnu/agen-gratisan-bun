// Port of internal/provider/epic/epic_test.go: storeURL behavior.
import { describe, expect, it } from "vitest";
import { storeURL } from "../src/provider/epic/epic.js";
import type { EpicElement } from "../src/provider/epic/response.js";

function element(partial: Partial<EpicElement> = {}): EpicElement {
  return {
    title: "",
    id: "",
    namespace: "",
    description: "",
    offerType: "",
    productSlug: null,
    urlSlug: "",
    keyImages: [],
    promotions: null,
    catalogNs: null,
    offerMappings: [],
    ...partial,
  };
}

describe("storeURL", () => {
  it("prefers a catalog productHome mapping", () => {
    expect(
      storeURL(
        element({
          productSlug: "cardpocalypse/home",
          urlSlug: "cardpocalypsegeneralaudience",
          catalogNs: {
            mappings: [{ pageSlug: "cardpocalypse", pageType: "productHome" }],
          },
          offerMappings: [{ pageSlug: "cardpocalypse-offer", pageType: "offer" }],
        }),
      ),
    ).toBe("https://store.epicgames.com/en-US/p/cardpocalypse");
  });

  it("falls back to an offerMappings productHome mapping", () => {
    expect(
      storeURL(
        element({
          productSlug: "legacy-product",
          urlSlug: "legacy-url",
          catalogNs: {
            mappings: [{ pageSlug: "catalog-offer", pageType: "offer" }],
          },
          offerMappings: [
            { pageSlug: "offer-only", pageType: "offer" },
            { pageSlug: "mapped-offer", pageType: "productHome" },
          ],
        }),
      ),
    ).toBe("https://store.epicgames.com/en-US/p/mapped-offer");
  });

  it("uses productSlug first", () => {
    expect(storeURL(element({ productSlug: "sample-game", urlSlug: "sample-game-123" }))).toBe(
      "https://store.epicgames.com/en-US/p/sample-game",
    );
  });

  it("falls back to urlSlug", () => {
    expect(storeURL(element({ urlSlug: "sample-game-123" }))).toBe(
      "https://store.epicgames.com/en-US/p/sample-game-123",
    );
  });

  it("returns empty without slugs", () => {
    expect(storeURL(element())).toBe("");
  });
});
