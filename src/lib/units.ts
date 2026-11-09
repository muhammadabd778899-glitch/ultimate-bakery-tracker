import { query, scalar } from '../db/database'

/* Units of measurement + explicit, user-defined conversions only.
 * We never guess that two unrelated units are convertible. */

export const UNITS = [
  'g', 'kg', 'oz', 'lb', 'ml', 'L', 'cup', 'tbsp', 'tsp', 'pcs', 'pack', 'tray', 'box', 'dozen',
] as const
export type Unit = string

export const WEIGHT: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 }
export const VOLUME: Record<string, number> = { ml: 1, L: 1000 }

export interface Conversion {
  from_unit: string
  to_unit: string
  factor: number
}

export function listConversions(): Conversion[] {
  return query<Conversion>('SELECT from_unit, to_unit, factor FROM unit_conversions ORDER BY from_unit, to_unit')
}

/** Converts `qty` from `from` to `to`.
 *  Returns null when no explicitly defined rule exists — callers must handle that. */
export function convert(qty: number, from: string, to: string): number | null {
  if (!from || !to) return null
  if (from === to) return qty

  // built-in same-dimension factors (only for clearly equivalent families)
  if (WEIGHT[from] && WEIGHT[to]) return (qty * WEIGHT[from]) / WEIGHT[to]
  if (VOLUME[from] && VOLUME[to]) return (qty * VOLUME[from]) / VOLUME[to]
  if (from === 'dozen' && (to === 'pcs' || to === 'each')) return qty * 12
  if ((from === 'pcs' || from === 'each') && to === 'dozen') return qty / 12

  const custom = listConversions().find(
    (c) => (c.from_unit === from && c.to_unit === to) || (c.from_unit === to && c.to_unit === from)
  )
  if (custom) {
    if (custom.from_unit === from) return qty * custom.factor
    return qty / custom.factor
  }
  return null
}

export function canConvert(from: string, to: string): boolean {
  return convert(1, from, to) !== null
}

/** Converts an ingredient quantity into that ingredient's purchase unit.
 *  Throws a helpful error when no rule exists (never silently wrong). */
export function toPurchaseUnit(
  qty: number,
  unit: string,
  purchaseUnit: string,
  ingredientName = 'ingredient'
): number {
  if (unit === purchaseUnit) return qty
  const converted = convert(qty, unit, purchaseUnit)
  if (converted === null) {
    throw new Error(
      `No conversion is defined from "${unit}" to "${purchaseUnit}" for ${ingredientName}. ` +
        `Add one in Settings → Unit conversions, or change the recipe unit.`
    )
  }
  return converted
}

export function unitOptions(): string[] {
  return [...UNITS]
}

export function conversionCount(): number {
  return scalar<number>('SELECT COUNT(*) AS c FROM unit_conversions') ?? 0
}
