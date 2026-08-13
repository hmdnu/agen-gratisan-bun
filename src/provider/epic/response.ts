// Epic API response types and a strict `unknown` decoder.
//
// Decoding mirrors Go's json.Unmarshal on the Go structs in response.go:
// - a missing field yields the Go zero value ("" / 0 / [] / null),
// - a present field with the wrong type is a parse error (thrown),
// - fields the Go structs do not consume (errors, price, paging) are ignored.
import { isArray, isInteger, isRecord, isString } from "../../util/guards.js";

export interface KeyImage {
  type: string;
  url: string;
}

export interface DiscountSetting {
  discountType: string;
  discountPercentage: number;
}

export interface Promotion {
  startDate: string;
  endDate: string;
  discountSetting: DiscountSetting;
}

export interface PromotionGroup {
  promotionalOffers: Promotion[];
}

export interface Promotions {
  promotionalOffers: PromotionGroup[];
  upcomingPromotionalOffers: PromotionGroup[];
}

export interface EpicMapping {
  pageSlug: string;
  pageType: string;
}

export interface CatalogNamespace {
  mappings: EpicMapping[];
}

export interface EpicElement {
  title: string;
  id: string;
  namespace: string;
  description: string;
  offerType: string;
  productSlug: string | null;
  urlSlug: string;
  keyImages: KeyImage[];
  promotions: Promotions | null;
  catalogNs: CatalogNamespace | null;
  offerMappings: EpicMapping[];
}

export interface EpicResponse {
  elements: EpicElement[];
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function parseError(value: unknown, path: string): Error {
  return new Error(`parse Epic response: cannot unmarshal ${describe(value)} into ${path}`);
}

/** Strict string read: undefined = missing (caller applies the zero value). */
function readStringField(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (!isString(value)) throw parseError(value, path);
  return value;
}

/** Strict integer read for int fields (Go rejects fractional numbers). */
function readIntField(value: unknown, path: string): number | undefined {
  if (value === undefined) return undefined;
  if (!isInteger(value)) throw parseError(value, path);
  return value;
}

function decodeMapping(raw: unknown, path: string): EpicMapping {
  if (!isRecord(raw)) throw parseError(raw, path);
  return {
    pageSlug: readStringField(raw["pageSlug"], path + ".PageSlug") ?? "",
    pageType: readStringField(raw["pageType"], path + ".PageType") ?? "",
  };
}

function decodeMappings(raw: unknown, path: string): EpicMapping[] {
  if (raw === undefined || raw === null) return [];
  if (!isArray(raw)) throw parseError(raw, path);
  return raw.map((mapping, i) => decodeMapping(mapping, `${path}[${i}]`));
}

function decodeCatalogNamespace(raw: unknown, path: string): CatalogNamespace | null {
  if (raw === undefined || raw === null) return null;
  if (!isRecord(raw)) throw parseError(raw, path);
  return { mappings: decodeMappings(raw["mappings"], path + ".Mappings") };
}

function decodeKeyImage(raw: unknown, path: string): KeyImage {
  if (!isRecord(raw)) throw parseError(raw, path);
  return {
    type: readStringField(raw["type"], path + ".Type") ?? "",
    url: readStringField(raw["url"], path + ".URL") ?? "",
  };
}

function decodePromotion(raw: unknown, path: string): Promotion {
  if (!isRecord(raw)) throw parseError(raw, path);
  const startDate = readStringField(raw["startDate"], path + ".StartDate") ?? "";
  const endDate = readStringField(raw["endDate"], path + ".EndDate") ?? "";

  let discountSetting: DiscountSetting = { discountType: "", discountPercentage: 0 };
  const settingRaw = raw["discountSetting"];
  if (settingRaw !== undefined) {
    if (!isRecord(settingRaw)) throw parseError(settingRaw, path + ".DiscountSetting");
    discountSetting = {
      discountType: readStringField(settingRaw["discountType"], path + ".DiscountSetting.DiscountType") ?? "",
      discountPercentage: readIntField(settingRaw["discountPercentage"], path + ".DiscountSetting.DiscountPercentage") ?? 0,
    };
  }
  return { startDate, endDate, discountSetting };
}

function decodePromotionGroup(raw: unknown, path: string): PromotionGroup {
  if (!isRecord(raw)) throw parseError(raw, path);
  const offersRaw = raw["promotionalOffers"];
  if (offersRaw === undefined) return { promotionalOffers: [] };
  if (!isArray(offersRaw)) throw parseError(offersRaw, path + ".PromotionalOffers");
  return {
    promotionalOffers: offersRaw.map((promotion, i) => decodePromotion(promotion, `${path}.PromotionalOffers[${i}]`)),
  };
}

function decodePromotionGroups(raw: unknown, path: string): PromotionGroup[] {
  if (raw === undefined) return [];
  if (!isArray(raw)) throw parseError(raw, path);
  return raw.map((group, i) => decodePromotionGroup(group, `${path}[${i}]`));
}

function decodePromotions(raw: unknown, path: string): Promotions {
  if (!isRecord(raw)) throw parseError(raw, path);
  return {
    promotionalOffers: decodePromotionGroups(raw["promotionalOffers"], path + ".PromotionalOffers"),
    upcomingPromotionalOffers: decodePromotionGroups(raw["upcomingPromotionalOffers"], path + ".UpcomingPromotionalOffers"),
  };
}

function decodeElement(raw: unknown, path: string): EpicElement {
  if (!isRecord(raw)) throw parseError(raw, path);

  let productSlug: string | null = null;
  const productSlugRaw = raw["productSlug"];
  if (productSlugRaw !== undefined && productSlugRaw !== null) {
    if (!isString(productSlugRaw)) throw parseError(productSlugRaw, path + ".ProductSlug");
    productSlug = productSlugRaw;
  }

  let keyImages: KeyImage[] = [];
  const keyImagesRaw = raw["keyImages"];
  if (keyImagesRaw !== undefined) {
    if (!isArray(keyImagesRaw)) throw parseError(keyImagesRaw, path + ".KeyImages");
    keyImages = keyImagesRaw.map((image, i) => decodeKeyImage(image, `${path}.KeyImages[${i}]`));
  }

  let promotions: Promotions | null = null;
  const promotionsRaw = raw["promotions"];
  if (promotionsRaw !== undefined && promotionsRaw !== null) {
    promotions = decodePromotions(promotionsRaw, path + ".Promotions");
  }

  const catalogNs = decodeCatalogNamespace(raw["catalogNs"], path + ".CatalogNs");
  const offerMappings = decodeMappings(raw["offerMappings"], path + ".OfferMappings");

  return {
    title: readStringField(raw["title"], path + ".Title") ?? "",
    id: readStringField(raw["id"], path + ".ID") ?? "",
    namespace: readStringField(raw["namespace"], path + ".Namespace") ?? "",
    description: readStringField(raw["description"], path + ".Description") ?? "",
    offerType: readStringField(raw["offerType"], path + ".OfferType") ?? "",
    productSlug,
    urlSlug: readStringField(raw["urlSlug"], path + ".URLSlug") ?? "",
    keyImages,
    promotions,
    catalogNs,
    offerMappings,
  };
}

export function decodeEpicResponse(raw: unknown): EpicResponse {
  // Navigation follows Go tags: data.Catalog.searchStore.elements.
  if (!isRecord(raw)) return { elements: [] };
  const dataRaw = raw["data"];
  if (dataRaw === undefined) return { elements: [] };
  if (!isRecord(dataRaw)) throw parseError(dataRaw, "Data");
  const catalogRaw = dataRaw["Catalog"];
  if (catalogRaw === undefined) return { elements: [] };
  if (!isRecord(catalogRaw)) throw parseError(catalogRaw, "Data.Catalog");
  const searchStoreRaw = catalogRaw["searchStore"];
  if (searchStoreRaw === undefined) return { elements: [] };
  if (!isRecord(searchStoreRaw)) throw parseError(searchStoreRaw, "Data.Catalog.SearchStore");
  const elementsRaw = searchStoreRaw["elements"];
  if (elementsRaw === undefined) return { elements: [] };
  if (!isArray(elementsRaw)) throw parseError(elementsRaw, "Data.Catalog.SearchStore.Elements");
  return {
    elements: elementsRaw.map((element, i) => decodeElement(element, `Data.Catalog.SearchStore.Elements[${i}]`)),
  };
}
