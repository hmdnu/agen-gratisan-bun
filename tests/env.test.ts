// Tests for the ported Go duration grammar and the tolerant .env loading.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnv, parseAppIds, parseGoDuration } from "../src/config/env.js";

describe("parseGoDuration", () => {
  it("parses valid Go durations", () => {
    expect(parseGoDuration("6h")).toBe(6 * 60 * 60 * 1000);
    expect(parseGoDuration("30m")).toBe(30 * 60 * 1000);
    expect(parseGoDuration("1h30m")).toBe(90 * 60 * 1000);
    expect(parseGoDuration("300ms")).toBe(300);
    expect(parseGoDuration("1.5h")).toBe(90 * 60 * 1000);
    expect(parseGoDuration("-5m")).toBe(-5 * 60 * 1000);
  });

  it("rejects malformed durations", () => {
    expect(() => parseGoDuration("6")).toThrow();
    expect(() => parseGoDuration("abc")).toThrow();
    expect(() => parseGoDuration("1x")).toThrow();
  });
});

describe("parseAppIds", () => {
  it("parses a comma-separated app id list", () => {
    expect(parseAppIds("214340, 214770")).toEqual([214340, 214770]);
  });

  it("returns an empty list for empty input", () => {
    expect(parseAppIds("")).toEqual([]);
    expect(parseAppIds("   ")).toEqual([]);
  });

  it("rejects malformed app ids", () => {
    expect(() => parseAppIds("abc")).toThrow();
    expect(() => parseAppIds("214340,abc")).toThrow();
    expect(() => parseAppIds("0")).toThrow();
    expect(() => parseAppIds("214340,")).toThrow();
  });
});

describe("loadEnv", () => {
  let envDir: string;

  beforeEach(() => {
    // A fresh empty cwd guarantees no .env file exists (tolerant mode) and
    // isolates the tests from the real working directory.
    envDir = mkdtempSync(join(tmpdir(), "dc-bot-env-"));
    vi.spyOn(process, "cwd").mockReturnValue(envDir);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(envDir, { recursive: true, force: true });
  });

  function stubRequiredEnv(): void {
    vi.stubEnv("DISCORD_TOKEN", "token");
    vi.stubEnv("DISCORD_CHANNEL_ID", "123");
    vi.stubEnv("EPIC_API_URL", "https://epic.example");
    vi.stubEnv("STEAM_API_URL", "https://steam.example");
  }

  it("throws when a required variable is missing", () => {
    vi.stubEnv("DISCORD_TOKEN", "");
    vi.stubEnv("DISCORD_CHANNEL_ID", "123");
    vi.stubEnv("EPIC_API_URL", "https://epic.example");
    vi.stubEnv("STEAM_API_URL", "https://steam.example");
    vi.stubEnv("CHECK_INTERVAL", "");

    expect(() => loadEnv()).toThrow("DISCORD_TOKEN is required");
  });

  it("rejects a non-positive CHECK_INTERVAL", () => {
    stubRequiredEnv();
    vi.stubEnv("CHECK_INTERVAL", "0s");

    expect(() => loadEnv()).toThrow("CHECK_INTERVAL must be a positive duration, e.g. 6h");
  });

  it("loads from the process environment without a .env file", () => {
    stubRequiredEnv();
    vi.stubEnv("CHECK_INTERVAL", "");

    const env = loadEnv();
    expect(env.discordToken).toBe("token");
    expect(env.discordChannelId).toBe("123");
    expect(env.epicApiUrl).toBe("https://epic.example");
    expect(env.steamApiUrl).toBe("https://steam.example");
    expect(env.checkIntervalMs).toBe(6 * 60 * 60 * 1000);
  });

  it("applies CHECK_INTERVAL from the environment", () => {
    stubRequiredEnv();
    vi.stubEnv("CHECK_INTERVAL", "30m");

    expect(loadEnv().checkIntervalMs).toBe(30 * 60 * 1000);
  });
});
