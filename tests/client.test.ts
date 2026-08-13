// Port of internal/discord/client_test.go: embed rendering behavior.
import type { APIEmbed } from "discord.js";
import { describe, expect, it } from "vitest";
import type { Game } from "../src/game/game.js";
import { EMBED_DESCRIPTION_LIMIT, gameEmbed } from "../src/discord/client.js";

function fieldValue(embed: APIEmbed, name: string): string {
  for (const field of embed.fields ?? []) {
    if (field.name === name) {
      return field.value;
    }
  }
  return "";
}

describe("gameEmbed", () => {
  it("renders the card fields", () => {
    const payload: Game = {
      title: "Free Game",
      store: "Epic Games",
      url: "https://store.epicgames.com/p/free-game",
      description: "A short description.",
      imageUrl: "https://example.com/image.png",
      freeUntil: new Date(Date.UTC(2026, 7, 13, 15, 0, 0)),
      sourceId: "",
    };

    const embed = gameEmbed(payload);

    expect(embed.title).toBe("Free Game");
    expect(embed.url).toBe(payload.url);
    expect(embed.description).toBe("A short description.");
    expect(embed.image?.url).toBe(payload.imageUrl);
    expect(fieldValue(embed, "Provider")).toBe("Epic Games");
    expect(fieldValue(embed, "Free until")).toBe("Aug 13, 2026 15:00 UTC");
    expect(fieldValue(embed, "Link")).toBe(payload.url);
  });

  it("omits optional content when empty", () => {
    const embed = gameEmbed({
      title: "No extras",
      store: "Epic Games",
      url: "",
      description: "",
      imageUrl: "",
      freeUntil: null,
      sourceId: "",
    });

    expect(embed.image).toBeUndefined();
    for (const field of embed.fields ?? []) {
      expect(["Free until", "Link"]).not.toContain(field.name);
    }
  });

  it("truncates a long description to the byte limit with an ellipsis", () => {
    const long = "a".repeat(EMBED_DESCRIPTION_LIMIT + 100);
    const embed = gameEmbed({
      title: "Long",
      store: "Epic Games",
      url: "",
      description: long,
      imageUrl: "",
      freeUntil: null,
      sourceId: "",
    });

    expect(Buffer.byteLength(embed.description ?? "", "utf8")).toBe(EMBED_DESCRIPTION_LIMIT);
    expect(embed.description?.endsWith("…")).toBe(true);
  });
});
