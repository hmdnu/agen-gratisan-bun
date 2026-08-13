// Discord client and embeds — the TS counterpart of
// internal/discord/client.go using discord.js v14 (pure JS, no native deps).
import { Client, Events } from "discord.js";
import type {
  APIEmbed,
  APIEmbedField,
  MessageCreateOptions,
} from "discord.js";
import type { Game } from "../game/game.js";
import { errorMessage } from "../util/guards.js";

export const EMBED_COLOR = 0x5865f2;
export const EMBED_DESCRIPTION_LIMIT = 4096;

// Type guard: a channel object that can send messages. discord.js types some
// text-based channels (PartialGroupDMChannel) without a send method, so narrow
// structurally instead of casting.
function isSendableChannel(
  value: unknown,
): value is { send: (options: MessageCreateOptions) => Promise<unknown> } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("send" in value)) {
    return false;
  }
  return typeof value.send === "function";
}

export class DiscordClient {
  private readonly session: Client;
  private readonly channelId: string;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  private startPromise: Promise<void> | null = null;

  constructor(
    private readonly token: string,
    channelId: string,
  ) {
    this.channelId = channelId;
    this.session = new Client({ intents: [] });
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    this.session.once(Events.ClientReady, () => {
      this.resolveReady();
    });
  }

  start(): Promise<void> {
    if (this.startPromise === null) {
      this.startPromise = this.loginAndWait();
    }
    return this.startPromise;
  }

  ready(): Promise<void> {
    return this.readyPromise;
  }

  /** Posts the game notification as a rich embed. */
  async sendGame(payload: Game): Promise<void> {
    try {
      const channel = await this.session.channels.fetch(this.channelId);
      if (!isSendableChannel(channel)) {
        throw new Error("channel not found or not text-based");
      }
      await channel.send({ embeds: [gameEmbed(payload)] });
    } catch (err) {
      throw new Error("send game notification: " + errorMessage(err));
    }
  }

  private async loginAndWait(): Promise<void> {
    try {
      await this.session.login(this.token);
    } catch (err) {
      throw new Error("open Discord session: " + errorMessage(err));
    }
    await this.readyPromise;
    console.log("Discord bot is running");

    await new Promise<void>((resolve) => {
      const onSignal = () => {
        process.removeListener("SIGINT", onSignal);
        process.removeListener("SIGTERM", onSignal);
        void this.session.destroy().then(resolve, resolve);
      };
      process.once("SIGINT", onSignal);
      process.once("SIGTERM", onSignal);
    });
  }

}

/** Builds the embed card for a free-game notification. */
export function gameEmbed(payload: Game): APIEmbed {
  const fields: APIEmbedField[] = [
    { name: "Provider", value: payload.store, inline: true },
  ];

  if (payload.freeUntil !== null) {
    fields.push({
      name: "Free until",
      value: formatFreeUntil(payload.freeUntil),
      inline: true,
    });
  }

  if (payload.url !== "") {
    fields.push({
      name: "Link",
      value: payload.url,
    });
  }

  const embed: APIEmbed = {
    title: payload.title,
    url: payload.url,
    description: truncate(payload.description, EMBED_DESCRIPTION_LIMIT),
    color: EMBED_COLOR,
    fields,
  };

  if (payload.imageUrl !== "") {
    embed.image = { url: payload.imageUrl };
  }

  return embed;
}

/** Shortens text to the given byte limit, appending an ellipsis. */
export function truncate(text: string, limit: number): string {
  const ellipsis = "…";
  if (Buffer.byteLength(text, "utf8") <= limit) {
    return text;
  }

  let cut = Math.max(0, limit - Buffer.byteLength(ellipsis, "utf8"));
  const bytes = Buffer.from(text, "utf8");
  // Walk back over UTF-8 continuation bytes to a rune start (Go utf8.RuneStart).
  while (cut > 0 && (bytes[cut] & 0xc0) === 0x80) {
    cut--;
  }
  return bytes.subarray(0, cut).toString("utf8") + ellipsis;
}

// Formats a date like Go's "Jan 2, 2006 15:04 MST" in UTC: English month,
// non-padded day, zero-padded hour/minute, "UTC" zone.
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export function formatFreeUntil(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
}


