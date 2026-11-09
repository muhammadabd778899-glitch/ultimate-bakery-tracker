/* Money helpers — every monetary value is rounded to 2 decimals on write
 * and on aggregation, so displayed figures always match stored figures. */

export const round2 = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 100) / 100

/** Quantities keep 4 decimals — scaling a recipe down can legitimately produce
 *  values like 0.002 L that must not round away to zero. */
export const roundQty = (n: number): number => Math.round((Number(n) + Number.EPSILON) * 10000) / 10000

export const round = (n: number, places = 3): number => {
  const f = Math.pow(10, places)
  return Math.round((Number(n) + Number.EPSILON) * f) / f
}

/** Coerce any form input into a finite, non-negative number. */
export function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback
  if (typeof v === 'string') {
    const parsed = parseFloat(v.replace(/[^0-9.\-]/g, ''))
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return fallback
}

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || String(v).trim() === ''
}

export function clampNonNegative(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function pct(part: number, whole: number): number {
  if (!whole || !Number.isFinite(whole)) return 0
  return round2((part / whole) * 100)
}
