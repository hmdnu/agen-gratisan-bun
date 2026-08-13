// Port of cmd/bot/bot_test.go: gameKey format and pollProviders wiring.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { gameKey, pollProviders } from "../src/bot.js";
import type { Notifier } from "../src/bot.js";
import type { Game } from "../src/game/game.js";
import { State } from "../src/notification/state.js";
import type { Provider } from "../src/provider/provider.js";

class FakeProvider implements Provider {
  games: Game[] = [];
  err: Error | null = null;
  wake: Date | null = null;
  wakeOk = false;
  nextCalls = 0;

  async fetch(): Promise<Game[]> {
    if (this.err !== null) {
      throw this.err;
    }
    return this.games;
  }

  nextRun(_now: Date): Date | null {
    this.nextCalls++;
    return this.wakeOk ? this.wake : null;
  }
}

class RecordingNotifier implements Notifier {
  sent: Game[] = [];
  err: Error | null = null;

  async sendGame(game: Game): Promise<void> {
    if (this.err !== null) {
      throw this.err;
    }
    this.sent.push(game);
  }
}

function openTestState(): { state: State; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "dc-bot-"));
  const state = State.open(join(dir, "state.db"));
  return {
    state,
    cleanup: () => {
      state.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

describe("gameKey", () => {
  it("formats as Store:SourceID:FreeUntil in Go RFC3339", () => {
    const key = gameKey({
      title: "",
      store: "Steam",
      url: "",
      description: "",
      imageUrl: "",
      freeUntil: new Date(Date.UTC(2100, 0, 1)),
      sourceId: "480",
    });
    expect(key).toBe("Steam:480:2100-01-01T00:00:00Z");
  });
});

describe("pollProviders", () => {
  it("notifies from all providers and returns the earliest wake", async () => {
    const { state, cleanup } = openTestState();
    try {
      const now = new Date(Date.UTC(2026, 7, 12, 12, 0, 0));

      const steamProvider = new FakeProvider();
      steamProvider.games = [{ title: "Steam Free", store: "Steam", sourceId: "480", freeUntil: now, url: "", description: "", imageUrl: "" }];
      steamProvider.wake = new Date(now.getTime() + 30 * 60 * 1000);
      steamProvider.wakeOk = true;

      const epicProvider = new FakeProvider();
      epicProvider.games = [{ title: "Epic Free", store: "Epic Games", sourceId: "ns1:game-id-1", freeUntil: now, url: "", description: "", imageUrl: "" }];
      epicProvider.wake = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      epicProvider.wakeOk = true;

      const notifier = new RecordingNotifier();

      const nextRun = await pollProviders([steamProvider, epicProvider], notifier, state);
      expect(notifier.sent).toHaveLength(2);
      expect(nextRun?.getTime()).toBe(now.getTime() + 30 * 60 * 1000);
    } finally {
      cleanup();
    }
  });

  it("continues when one provider fails and consults its NextRun", async () => {
    const { state, cleanup } = openTestState();
    try {
      const now = new Date();

      const failing = new FakeProvider();
      failing.err = new Error("network down");

      const working = new FakeProvider();
      working.games = [{ title: "Steam Free", store: "Steam", sourceId: "480", freeUntil: null, url: "", description: "", imageUrl: "" }];
      working.wake = new Date(now.getTime() + 30 * 60 * 1000);
      working.wakeOk = true;

      const notifier = new RecordingNotifier();

      const nextRun = await pollProviders([failing, working], notifier, state);
      expect(notifier.sent).toHaveLength(1);
      expect(failing.nextCalls).toBe(1);
      expect(nextRun?.getTime()).toBe(now.getTime() + 30 * 60 * 1000);
    } finally {
      cleanup();
    }
  });

  it("skips already-notified games", async () => {
    const { state, cleanup } = openTestState();
    try {
      const payload: Game = {
        title: "",
        store: "Steam",
        sourceId: "480",
        freeUntil: new Date(Date.UTC(2026, 7, 12, 12, 0, 0)),
        url: "",
        description: "",
        imageUrl: "",
      };
      state.mark(gameKey(payload));

      const steamProvider = new FakeProvider();
      steamProvider.games = [payload];
      const notifier = new RecordingNotifier();

      await pollProviders([steamProvider], notifier, state);
      expect(notifier.sent).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("returns an error when send fails and does not mark", async () => {
    const { state, cleanup } = openTestState();
    try {
      const payload: Game = {
        title: "",
        store: "Steam",
        sourceId: "480",
        freeUntil: new Date(Date.UTC(2026, 7, 12, 12, 0, 0)),
        url: "",
        description: "",
        imageUrl: "",
      };
      const steamProvider = new FakeProvider();
      steamProvider.games = [payload];
      const notifier = new RecordingNotifier();
      notifier.err = new Error("discord down");

      await expect(pollProviders([steamProvider], notifier, state)).rejects.toThrow();
      expect(state.has(gameKey(payload))).toBe(false);
    } finally {
      cleanup();
    }
  });
});
