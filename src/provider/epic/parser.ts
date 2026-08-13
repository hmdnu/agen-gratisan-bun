// Promotion-window logic, a 1:1 port of internal/provider/epic/parser.go.
import { errorMessage } from "../../util/guards.js";
import { decodeEpicResponse } from "./response.js";
import type { EpicElement, EpicResponse, Promotion, PromotionGroup } from "./response.js";

/** Identifies an Epic game and its free-promotion window. */
export interface FreeGameRelease {
  element: EpicElement;
  startDate: Date;
  endDate: Date;
}

/** Parses the raw Epic API response. */
export function parseEpicResponse(data: Uint8Array): EpicResponse {
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(data).toString("utf8"));
  } catch (err) {
    throw new Error("parse Epic response: " + errorMessage(err));
  }
  return decodeEpicResponse(raw);
}

/** Returns games that are free at the requested time. */
export function currentFreeGames(response: EpicResponse, now: Date): EpicElement[] {
  const releases = currentFreeGameReleases(response, now);
  const games: EpicElement[] = [];
  for (const release of releases) {
    games.push(release.element);
  }
  return games;
}

/** Returns active free games with promotion metadata. */
export function currentFreeGameReleases(response: EpicResponse, now: Date): FreeGameRelease[] {
  return currentFreeGameReleasesForElements(response.elements, now);
}

function currentFreeGameReleasesForElements(elements: EpicElement[], now: Date): FreeGameRelease[] {
  const releases: FreeGameRelease[] = [];
  for (const element of elements) {
    const release = currentFreeGameReleaseForElement(element, now);
    if (release !== null) {
      releases.push(release);
    }
  }
  return releases;
}

function currentFreeGameReleaseForElement(element: EpicElement, now: Date): FreeGameRelease | null {
  if (element.promotions === null) {
    return null;
  }
  return currentFreeGameReleaseForGroups(element, element.promotions.promotionalOffers, now);
}

function currentFreeGameReleaseForGroups(
  element: EpicElement,
  groups: PromotionGroup[],
  now: Date,
): FreeGameRelease | null {
  for (const group of groups) {
    const release = currentFreeGameReleaseForGroup(element, group, now);
    if (release !== null) {
      return release;
    }
  }
  return null;
}

function currentFreeGameReleaseForGroup(element: EpicElement, group: PromotionGroup, now: Date): FreeGameRelease | null {
  for (const promotion of group.promotionalOffers) {
    const release = currentFreeGameRelease(element, promotion, now);
    if (release !== null) {
      return release;
    }
  }
  return null;
}

/** Finds the earliest upcoming free-promotion start time; null when none. */
export function nextFreeGameStart(response: EpicResponse, now: Date): Date | null {
  return nextFreeGameStartForElements(response.elements, now);
}

function nextFreeGameStartForElements(elements: EpicElement[], now: Date): Date | null {
  let nextStart: Date | null = null;

  for (const element of elements) {
    const startDate = nextFreeGameStartForElement(element, now);
    if (startDate === null) {
      continue;
    }
    if (nextStart === null || startDate.getTime() < nextStart.getTime()) {
      nextStart = startDate;
    }
  }

  return nextStart;
}

function nextFreeGameStartForElement(element: EpicElement, now: Date): Date | null {
  if (element.promotions === null) {
    return null;
  }

  const promotions = element.promotions;
  const currentStart = earliestFreeGameStart(promotions.promotionalOffers, now);
  const upcomingStart = earliestFreeGameStart(promotions.upcomingPromotionalOffers, now);

  return earlierStart(currentStart, upcomingStart);
}

function earliestFreeGameStart(groups: PromotionGroup[], now: Date): Date | null {
  let earliestStart: Date | null = null;

  for (const group of groups) {
    const startDate = earliestFreeGameStartInGroup(group, now);
    if (startDate === null) {
      continue;
    }
    if (earliestStart === null || startDate.getTime() < earliestStart.getTime()) {
      earliestStart = startDate;
    }
  }

  return earliestStart;
}

function earliestFreeGameStartInGroup(group: PromotionGroup, now: Date): Date | null {
  let earliestStart: Date | null = null;

  for (const promotion of group.promotionalOffers) {
    const startDate = upcomingFreeGameStart(promotion, now);
    if (startDate === null) {
      continue;
    }
    if (earliestStart === null || startDate.getTime() < earliestStart.getTime()) {
      earliestStart = startDate;
    }
  }

  return earliestStart;
}

/** Chooses the earlier available time from two candidates. */
function earlierStart(first: Date | null, second: Date | null): Date | null {
  if (first === null) {
    return second;
  }
  if (second === null || first.getTime() < second.getTime()) {
    return first;
  }
  return second;
}

/** Validates a promotion and builds its release metadata. */
function currentFreeGameRelease(element: EpicElement, promotion: Promotion, now: Date): FreeGameRelease | null {
  const dates = promotionDates(promotion);
  if (dates === null || !isCurrentFreePromotion(promotion, dates.startDate, dates.endDate, now)) {
    return null;
  }
  return {
    element,
    startDate: dates.startDate,
    endDate: dates.endDate,
  };
}

/** Validates that a promotion starts in the future and is free. */
function upcomingFreeGameStart(promotion: Promotion, now: Date): Date | null {
  const dates = promotionDates(promotion);
  if (dates === null || !isFreePromotion(promotion) || now.getTime() >= dates.startDate.getTime()) {
    return null;
  }
  return dates.startDate;
}

// Strict RFC3339. Go's time.Parse(time.RFC3339, ...) rejects strings without a
// timezone offset; JS Date.parse would accept them as local time, so validate
// first. Offsets normalize to an instant, so comparisons match Go.
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Parses and validates both promotion boundary timestamps; null on failure. */
function promotionDates(promotion: Promotion): { startDate: Date; endDate: Date } | null {
  const startDate = parseRfc3339(promotion.startDate);
  if (startDate === null) {
    return null;
  }
  const endDate = parseRfc3339(promotion.endDate);
  if (endDate === null) {
    return null;
  }
  return { startDate, endDate };
}

function parseRfc3339(value: string): Date | null {
  if (!RFC3339_RE.test(value)) {
    return null;
  }
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    return null;
  }
  return new Date(ms);
}

/** Checks whether a free promotion is active at now. */
function isCurrentFreePromotion(promotion: Promotion, startDate: Date, endDate: Date, now: Date): boolean {
  return (
    isFreePromotion(promotion) &&
    now.getTime() >= startDate.getTime() &&
    now.getTime() < endDate.getTime()
  );
}

/** Reports whether Epic marks a promotion as fully discounted. */
function isFreePromotion(promotion: Promotion): boolean {
  return promotion.discountSetting.discountPercentage === 0;
}
