// Port of internal/notification/state_test.go: persistence across reopen.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { State } from "../src/notification/state.js";

describe("State", () => {
  it("persists notification keys across reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "dc-bot-"));
    try {
      const path = join(dir, "notifications.db");

      const state = State.open(path);
      expect(state.has("epic:one")).toBe(false);

      state.mark("epic:one");
      state.mark("epic:one");
      state.close();

      const reloaded = State.open(path);
      expect(reloaded.has("epic:one")).toBe(true);
      reloaded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
