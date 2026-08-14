// Steam API response types and a strict `unknown` decoder, mirroring the Go
// structs in response.go: missing field → zero value, present wrong type →
// parse error, unconsumed fields ignored.
import { isArray, isInteger, isRecord, isString } from "../../util/guards.js";

export interface SteamItem {
  id: number;
  name: string;
  discountPercent: number;
  discountExpiration: number;
  headerImage: string;
  largeCapsuleImage: string;
}

export interface SteamResponse {
  items: SteamItem[];
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function parseError(value: unknown, path: string): Error {
  return new Error(`parse Steam response: cannot unmarshal ${describe(value)} into ${path}`);
}

function readStringField(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isString(value)) throw parseError(value, path);
  return value;
}

/** Strict integer read for Go int64/int fields (fractions rejected). */
function readIntField(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (!isInteger(value)) throw parseError(value, path);
  return value;
}

function decodeItem(raw: unknown, path: string): SteamItem {
  if (!isRecord(raw)) throw parseError(raw, path);
  return {
    id: readIntField(raw["id"], path + ".ID") ?? 0,
    name: readStringField(raw["name"], path + ".Name") ?? "",
    discountPercent: readIntField(raw["discount_percent"], path + ".DiscountPercent") ?? 0,
    discountExpiration: readIntField(raw["discount_expiration"], path + ".DiscountExpiration") ?? 0,
    headerImage: readStringField(raw["header_image"], path + ".HeaderImage") ?? "",
    largeCapsuleImage: readStringField(raw["large_capsule_image"], path + ".LargeCapsuleImage") ?? "",
  };
}

export function decodeSteamResponse(raw: unknown): SteamResponse {
  if (!isRecord(raw)) return { items: [] };
  const specialsRaw = raw["specials"];
  if (specialsRaw === undefined) return { items: [] };
  if (!isRecord(specialsRaw)) throw parseError(specialsRaw, "Specials");
  const itemsRaw = specialsRaw["items"];
  if (itemsRaw === undefined) return { items: [] };
  if (!isArray(itemsRaw)) throw parseError(itemsRaw, "Specials.Items");
  return {
    items: itemsRaw.map((item, i) => decodeItem(item, `Specials.Items[${i}]`)),
  };
}

// Decodes one /api/appdetails entry keyed by its appid. Returns null when the
// app has no data (success false or missing data), which the caller treats as
// "not free"; a present field with the wrong type is still a parse error.
export function decodeAppDetails(raw: unknown, appId: number): SteamItem | null {
  if (!isRecord(raw)) throw parseError(raw, "AppDetails");
  const entryRaw = raw[String(appId)];
  if (entryRaw === undefined) return null;
  if (!isRecord(entryRaw)) throw parseError(entryRaw, "AppDetails." + appId);

  const successRaw = entryRaw["success"];
  if (successRaw !== undefined && typeof successRaw !== "boolean") {
    throw parseError(successRaw, "AppDetails." + appId + ".Success");
  }
  if (successRaw === false) return null;

  const dataRaw = entryRaw["data"];
  if (dataRaw === undefined || dataRaw === null) return null;
  if (!isRecord(dataRaw)) throw parseError(dataRaw, "AppDetails." + appId + ".Data");

  let discountPercent = 0;
  const priceRaw = dataRaw["price_overview"];
  if (priceRaw !== undefined) {
    if (!isRecord(priceRaw)) throw parseError(priceRaw, "AppDetails." + appId + ".Data.PriceOverview");
    discountPercent = readIntField(priceRaw["discount_percent"], "AppDetails." + appId + ".Data.PriceOverview.DiscountPercent") ?? 0;
  }

  return {
    id: appId,
    name: readStringField(dataRaw["name"], "AppDetails." + appId + ".Data.Name") ?? "",
    discountPercent,
    discountExpiration: 0,
    headerImage: readStringField(dataRaw["header_image"], "AppDetails." + appId + ".Data.HeaderImage") ?? "",
    largeCapsuleImage: readStringField(dataRaw["capsule_image"], "AppDetails." + appId + ".Data.CapsuleImage") ?? "",
  };
}
