// Port of internal/provider/provider_test.go: the Provider contract.
import { describe, expect, it } from "vitest";
import type { Game } from "../src/game/game.js";
import type { Provider } from "../src/provider/provider.js";

class FakeProvider implements Provider {
  games: Game[] = [];
  err: Error | null = null;

  async fetch(): Promise<Game[]> {
    if (this.err !== null) {
      throw this.err;
    }
    return this.games;
  }

  // Reports no scheduled wake for the fake.
  nextRun(_now: Date): Date | null {
    return null;
  }
}

describe("Provider", () => {
  it("fetch returns free games", async () => {
    const provider = new FakeProvider();
    provider.games = [{ title: "Free Game", store: "Epic Games", url: "", description: "", imageUrl: "", freeUntil: null, sourceId: "" }];

    const got = await provider.fetch();
    expect(got).toHaveLength(1);
    expect(got[0].title).toBe("Free Game");
    expect(got[0].store).toBe("Epic Games");
  });

  it("fetch returns an error on failure", async () => {
    const provider = new FakeProvider();
    provider.err = new Error("fetch failed");

    await expect(provider.fetch()).rejects.toThrow();
  });

  it("fetch returns empty without free games", async () => {
    const provider = new FakeProvider();

    const got = await provider.fetch();
    expect(got).toHaveLength(0);
  });

  it("nextRun reports no scheduled wake", () => {
    const provider = new FakeProvider();

    expect(provider.nextRun(new Date())).toBeNull();
  });
});
