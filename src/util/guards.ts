// Type guards for narrowing unknown JSON payloads. The codebase never uses
// `any`; every parsed value is `unknown` and narrowed through these helpers.

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isNumber(value: unknown): value is number {
  return typeof value === "number" && !Number.isNaN(value);
}

/** True for integral JSON numbers (Go int/int64 fields reject fractions). */
export function isInteger(value: unknown): value is number {
  return isNumber(value) && Number.isInteger(value);
}

export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
