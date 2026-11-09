import type { Recipe, RecipeIngredient, Settings } from '../types'
import { round, round2, pct } from './money'
import { toPurchaseUnit } from './units'

/* ================================================================== *
 * Recipe costing
 * ================================================================== */

export interface IngredientCostLine {
  ingredient_id: string | null
  name: string
  quantity: number
  unit: string
  cost_quantity: number
  purchase_unit: string
  unit_cost: number
  cost: number
  convertible: boolean
  error?: string
}

export interface RecipeCosting {
  ingredientCost: number
  packagingCost: number
  laborCost: number
  overheadCost: number
  totalCost: number
  costPerUnit: number
  lines: IngredientCostLine[]
  blocked: string[]
}

export function costRecipe(
  recipe: Recipe,
  lines: RecipeIngredient[],
  settings: Settings,
  unitCosts: Record<string, { cost: number; purchase_unit: string }>
): RecipeCosting {
  const resultLines: IngredientCostLine[] = []
  const blocked: string[] = []
  let ingredientCost = 0

  for (const li of lines) {
    const info = li.ingredient_id ? unitCosts[li.ingredient_id] : undefined
    const unitCost = info?.cost ?? li.unit_cost ?? 0
    const purchaseUnit = info?.purchase_unit ?? li.unit
    let costQuantity = 0
    let cost = 0
    let convertible = true
    let error: string | undefined

    try {
      if (info && li.ingredient_id) {
        costQuantity = toPurchaseUnit(li.quantity, li.unit, purchaseUnit, li.ingredient_name)
        cost = round2(costQuantity * unitCost)
      } else {
        costQuantity = li.quantity
        cost = round2(li.quantity * unitCost)
      }
    } catch (e) {
      convertible = false
      error = e instanceof Error ? e.message : String(e)
      blocked.push(error)
    }

    ingredientCost += cost
    resultLines.push({
      ingredient_id: li.ingredient_id,
      name: li.ingredient_name,
      quantity: li.quantity,
      unit: li.unit,
      cost_quantity: round(costQuantity, 4),
      purchase_unit: purchaseUnit,
      unit_cost: unitCost,
      cost,
      convertible,
      error,
    })
  }

  const packagingCost = round2(recipe.packaging_cost || 0)

  const rate = settings.default_labor_rate || 0
  const laborCost = round2(
    settings.labor_unit === 'minute' ? (recipe.labor_minutes || 0) * rate : ((recipe.labor_minutes || 0) / 60) * rate
  )

  const base = round2(ingredientCost + packagingCost + laborCost)
  let overheadCost: number
  if (recipe.overhead_override !== null && recipe.overhead_override !== undefined && recipe.overhead_override !== 0) {
    overheadCost = round2(recipe.overhead_override)
  } else if (settings.overhead_method === 'fixed') {
    overheadCost = round2(settings.overhead_fixed || 0)
  } else {
    overheadCost = round2((base * (settings.overhead_percent || 0)) / 100)
  }

  const totalCost = round2(base + overheadCost)
  const yieldQty = recipe.yield_qty > 0 ? recipe.yield_qty : 1
  const costPerUnit = round2(totalCost / yieldQty)

  return { ingredientCost: round2(ingredientCost), packagingCost, laborCost, overheadCost, totalCost, costPerUnit, lines: resultLines, blocked }
}

export interface Profitability {
  sellingPrice: number
  costPerUnit: number
  profit: number
  marginPct: number
  hasPrice: boolean
  incomplete: boolean
}

export function profitability(sellingPrice: number, costPerUnit: number): Profitability {
  const price = round2(sellingPrice || 0)
  const cost = round2(costPerUnit || 0)
  const hasPrice = price > 0
  return {
    sellingPrice: price,
    costPerUnit: cost,
    profit: round2(price - cost),
    marginPct: hasPrice ? pct(price - cost, price) : 0,
    hasPrice,
    incomplete: !hasPrice,
  }
}

/** Scales a recipe to a different output quantity (exact, no premature rounding). */
export function scaleQuantity(quantity: number, originalYield: number, targetYield: number): number {
  if (!originalYield) return quantity
  return (quantity * targetYield) / originalYield
}

/* ================================================================== *
 * Order totals
 * ================================================================== */

export interface OrderTotals {
  subtotal: number
  discount: number
  taxable: number
  tax_rate: number
  tax_amount: number
  delivery_fee: number
  total: number
}

export function computeOrderTotals(input: {
  subtotal: number
  discount: number
  tax_rate: number
  delivery_fee: number
}): OrderTotals {
  const subtotal = round2(Math.max(0, input.subtotal || 0))
  const discount = round2(Math.max(0, input.discount || 0))
  const taxable = round2(Math.max(0, subtotal - discount))
  const tax_rate = Math.max(0, input.tax_rate || 0)
  const tax_amount = round2((taxable * tax_rate) / 100)
  const delivery_fee = round2(Math.max(0, input.delivery_fee || 0))
  return {
    subtotal,
    discount,
    taxable,
    tax_rate,
    tax_amount,
    delivery_fee,
    total: round2(taxable + tax_amount + delivery_fee),
  }
}

export function paymentStatusFor(total: number, amountPaid: number): 'Unpaid' | 'Partially Paid' | 'Paid' | 'Refunded' {
  if (amountPaid < -0.004) return 'Refunded'
  if (amountPaid <= 0.004) return 'Unpaid'
  if (amountPaid >= total - 0.004) return 'Paid'
  return 'Partially Paid'
}

/* ================================================================== *
 * Inventory math
 * ================================================================== */

export function stockStatus(current: number, min: number): 'out' | 'low' | 'ok' {
  if (current <= 0.0001) return 'out'
  if (min > 0 && current <= min) return 'low'
  return 'ok'
}

export function stockValue(stock: number, unitCost: number): number {
  return round2((stock || 0) * (unitCost || 0))
}
