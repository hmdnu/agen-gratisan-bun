import { config as loadDotenv } from "dotenv";
import { existsSync } from "node:fs";
import { errorMessage } from "../util/guards.js";

export interface Env {
  discordToken: string;
  discordChannelId: string;
  epicApiUrl: string;
  steamApiUrl: string;
  steamWatchAppids: number[];
  checkIntervalMs: number;
}

// LoadEnv reads runtime configuration. `.env` is optional: when present it is
// loaded (values do not override existing process env vars), otherwise the
// process environment is used as-is (e.g. a hosting panel). A required
// variable missing from both sources fails startup.
export function loadEnv(): Env {
  if (existsSync(".env")) {
    const result = loadDotenv();
    if (result.error) {
      throw new Error("load .env: " + errorMessage(result.error));
    }
  }

  let checkIntervalMs = 6 * 60 * 60 * 1000;

  const checkIntervalValue = process.env["CHECK_INTERVAL"] ?? "";
  if (checkIntervalValue !== "") {
    let parsed: number;
    try {
      parsed = parseGoDuration(checkIntervalValue);
    } catch {
      throw new Error("CHECK_INTERVAL must be a positive duration, e.g. 6h");
    }
    if (parsed <= 0) {
      throw new Error("CHECK_INTERVAL must be a positive duration, e.g. 6h");
    }
    checkIntervalMs = parsed;
  }

  const discordToken = process.env["DISCORD_TOKEN"] ?? "";
  if (discordToken === "") {
    throw new Error("DISCORD_TOKEN is required");
  }

  const discordChannelId = process.env["DISCORD_CHANNEL_ID"] ?? "";
  if (discordChannelId === "") {
    throw new Error("DISCORD_CHANNEL_ID is required");
  }

  const epicApiUrl = process.env["EPIC_API_URL"] ?? "";
  if (epicApiUrl === "") {
    throw new Error("EPIC_API_URL is required");
  }

  const steamApiUrl = process.env["STEAM_API_URL"] ?? "";
  if (steamApiUrl === "") {
    throw new Error("STEAM_API_URL is required");
  }

  const steamWatchAppids = parseAppIds(process.env["STEAM_WATCH_APPIDS"] ?? "");

  return {
    discordToken,
    discordChannelId,
    epicApiUrl,
    steamApiUrl,
    steamWatchAppids,
    checkIntervalMs,
  };
}

// parseAppIds parses a comma-separated Steam app-id list ("214340,214770")
// into numbers; empty or whitespace-only input yields an empty list, and any
// malformed entry throws.
export function parseAppIds(input: string): number[] {
  const trimmed = input.trim();
  if (trimmed === "") {
    return [];
  }
  return trimmed.split(",").map((part) => {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('STEAM_WATCH_APPIDS must be a comma-separated list of app ids, e.g. "214340,214770"');
    }
    return n;
  });
}

const DURATION_RE = /([+-]?\d+(?:\.\d+)?)(ns|us|µs|μs|ms|s|m|h)/g;

const UNIT_NS: Record<string, number> = {
  ns: 1,
  us: 1e3,
  µs: 1e3,
  μs: 1e3,
  ms: 1e6,
  s: 1e9,
  m: 60e9,
  h: 3600e9,
};

// parseGoDuration parses a Go time.ParseDuration string and returns
// milliseconds. Grammar: concatenated signed numbers with units
// (ns/us/µs/μs/ms/s/m/h), e.g. "6h", "1h30m", "-5m", "300ms".
export function parseGoDuration(input: string): number {
  let totalNs = 0;
  let lastIndex = 0;
  let matched = false;

  for (
    let match = DURATION_RE.exec(input);
    match !== null;
    match = DURATION_RE.exec(input)
  ) {
    if (match.index !== lastIndex) {
      throw new Error("invalid duration");
    }
    const value = Number(match[1]);
    const unit = match[2];
    totalNs += value * UNIT_NS[unit];
    lastIndex = DURATION_RE.lastIndex;
    matched = true;
  }

  if (!matched || lastIndex !== input.length) {
    throw new Error("invalid duration");
  }
  return totalNs / 1e6;
}
