import { query, queryOne, run, transaction, scalar, nowIso, logAudit, getDb, insertSql } from '../db/database'
import { uid } from '../lib/id'
import { round2, roundQty } from '../lib/money'
import { todayKey } from '../lib/dates'
import { notifyDataChanged } from '../store/app'
import type { Ingredient, InventoryMovement, Purchase, PurchaseItem, Settings, WasteRecord } from '../types'
import { getSettings } from './settings'

/* ============================== Ingredients ============================== */

export interface LowStockRow {
  id: string
  name: string
  current_stock: number
  min_stock: number
  purchase_unit: string
  status: 'out' | 'low'
}

export function listIngredients(opts: { search?: string; category?: string } = {}): Ingredient[] {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.search?.trim()) {
    where.push('(name LIKE ? OR category LIKE ? OR storage_location LIKE ?)')
    const q = `%${opts.search.trim()}%`
    params.push(q, q, q)
  }
  if (opts.category) {
    where.push('category = ?')
    params.push(opts.category)
  }
  return query(
    `SELECT * FROM ingredients ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name COLLATE NOCASE ASC`,
    params
  )
}

export function getIngredient(id: string): Ingredient | undefined {
  return queryOne<Ingredient>('SELECT * FROM ingredients WHERE id = ?', [id])
}

export function ingredientCategories(): string[] {
  return query<{ category: string }>('SELECT DISTINCT category FROM ingredients ORDER BY category').map((r) => r.category)
}

export function createIngredient(input: Partial<Ingredient>): Ingredient {
  const id = uid('ing_')
  run(
    `INSERT INTO ingredients (id,name,category,purchase_unit,current_stock,min_stock,reorder_qty,avg_cost,supplier_id,storage_location,expiry_date,notes,created_at,is_sample)
     VALUES (?,?,?,?,0,?,?,?,?,?,?,?,?,0)`,
    [
      id,
      input.name?.trim() ?? '',
      input.category || 'Other',
      input.purchase_unit || 'g',
      Number(input.min_stock) || 0,
      Number(input.reorder_qty) || 0,
      Number(input.avg_cost) || 0,
      input.supplier_id ?? null,
      input.storage_location ?? '',
      input.expiry_date ?? null,
      input.notes ?? '',
      nowIso(),
    ]
  )
  logAudit('ingredient', id, 'create', input.name)
  notifyDataChanged()
  return getIngredient(id)!
}

export function updateIngredient(id: string, input: Partial<Ingredient>) {
  run(
    `UPDATE ingredients SET name=?, category=?, purchase_unit=?, min_stock=?, reorder_qty=?, avg_cost=?,
      supplier_id=?, storage_location=?, expiry_date=?, notes=? WHERE id=?`,
    [
      input.name?.trim() ?? '',
      input.category || 'Other',
      input.purchase_unit || 'g',
      Number(input.min_stock) || 0,
      Number(input.reorder_qty) || 0,
      Number(input.avg_cost) || 0,
      input.supplier_id ?? null,
      input.storage_location ?? '',
      input.expiry_date ?? null,
      input.notes ?? '',
      id,
    ]
  )
  logAudit('ingredient', id, 'update', input.name)
  notifyDataChanged()
}

export function deleteIngredient(id: string) {
  transaction(() => {
    run('UPDATE recipe_ingredients SET ingredient_id = NULL WHERE ingredient_id = ?', [id])
    run('UPDATE purchase_items SET ingredient_id = NULL WHERE ingredient_id = ?', [id])
    run('DELETE FROM inventory_movements WHERE ingredient_id = ?', [id])
    run('DELETE FROM ingredients WHERE id = ?', [id])
  })
  logAudit('ingredient', id, 'delete')
  notifyDataChanged()
}

/* ====================== Auditable stock movement ledger ====================== */

export type MovementType = 'purchase' | 'production_consumption' | 'waste' | 'adjustment' | 'return' | 'correction'

export interface MovementInput {
  ingredient_id: string
  movement_type: MovementType
  /** signed: positive adds stock, negative removes stock */
  quantity: number
  movement_date?: string
  reason: string
  related_batch_id?: string | null
  related_purchase_id?: string | null
  related_order_id?: string | null
  related_waste_id?: string | null
}

export class StockError extends Error {}

/**
 * Applies one stock change. Must be called inside a transaction when
 * combined with other writes. Never silently ignores a bad quantity.
 */
export function applyMovement(input: MovementInput): InventoryMovement {
  const settings = getSettings()
  const ing = getIngredient(input.ingredient_id)
  if (!ing) throw new StockError('That ingredient no longer exists.')

  const qty = roundQty(Number(input.quantity) || 0)
  if (!Number.isFinite(qty)) throw new StockError('Quantity must be a number.')
  if (qty === 0) throw new StockError('Quantity cannot be zero.')

  const next = roundQty((Number(ing.current_stock) || 0) + qty)
  if (next < -0.0001 && !settings.allow_negative_stock) {
    throw new StockError(
      `Not enough ${ing.name}: you have ${ing.current_stock} ${ing.purchase_unit} and this change needs ` +
        `${Math.abs(qty)} ${ing.purchase_unit}. Enable negative stock in Settings if this is intentional.`
    )
  }

  run(
    `INSERT INTO inventory_movements
      (ingredient_id, movement_type, quantity, stock_after, movement_date, related_order_id, related_batch_id,
       related_purchase_id, related_waste_id, reason, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      input.ingredient_id,
      input.movement_type,
      qty,
      next,
      input.movement_date || todayKey(),
      input.related_order_id ?? null,
      input.related_batch_id ?? null,
      input.related_purchase_id ?? null,
      input.related_waste_id ?? null,
      input.reason ?? '',
      nowIso(),
    ]
  )
  run('UPDATE ingredients SET current_stock = ? WHERE id = ?', [next, input.ingredient_id])
  return {
    id: scalar<number>('SELECT last_insert_rowid() AS id') ?? 0,
    ingredient_id: input.ingredient_id,
    movement_type: input.movement_type,
    quantity: qty,
    stock_after: next,
    movement_date: input.movement_date || todayKey(),
    related_order_id: input.related_order_id ?? null,
    related_batch_id: input.related_batch_id ?? null,
    related_purchase_id: input.related_purchase_id ?? null,
    related_waste_id: input.related_waste_id ?? null,
    reason: input.reason ?? '',
    created_at: nowIso(),
  }
}

export function listMovements(opts: { ingredientId?: string; limit?: number } = {}): (InventoryMovement & { ingredient_name: string })[] {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.ingredientId) {
    where.push('m.ingredient_id = ?')
    params.push(opts.ingredientId)
  }
  return query(
    `SELECT m.*, i.name AS ingredient_name
     FROM inventory_movements m LEFT JOIN ingredients i ON i.id = m.ingredient_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY m.id DESC LIMIT ?`,
    [...params, opts.limit ?? 300]
  )
}

/** Recomputes every stock level from the ledger — a self-healing integrity check. */
export function recalculateAllStock(): { fixed: number; checked: number } {
  return transaction(() => {
    const totals = query<{ id: string; total: number | null }>(
      'SELECT ingredient_id AS id, SUM(quantity) AS total FROM inventory_movements GROUP BY ingredient_id'
    )
    const map = new Map(totals.map((t) => [t.id, round2(t.total ?? 0)]))
    const all = query<Ingredient>('SELECT id, name, current_stock FROM ingredients')
    let fixed = 0
    for (const ing of all) {
      const expected = map.get(ing.id) ?? 0
      if (Math.abs(expected - (ing.current_stock || 0)) > 0.001) {
        fixed++
        logAudit('ingredient', ing.id, 'stock_recalculated', `${ing.current_stock} -> ${expected}`)
      }
      run('UPDATE ingredients SET current_stock = ? WHERE id = ?', [expected, ing.id])
    }
    notifyDataChanged()
    return { fixed, checked: all.length }
  })
}

export function lowStockIngredients(): LowStockRow[] {
  const warn = getSettings().low_stock_warnings
  if (!warn) return []
  return query<LowStockRow>(
    `SELECT id, name, current_stock, min_stock, purchase_unit FROM ingredients
     WHERE min_stock > 0 AND current_stock <= min_stock
     ORDER BY (current_stock / NULLIF(min_stock,0)) ASC, name ASC`
  )
}

export function expiringIngredients(withinDays: number): (Ingredient & { days_left: number })[] {
  const rows = query<Ingredient & { days_left: number }>(
    `SELECT *, CAST(julianday(expiry_date) - julianday(?) AS INTEGER) AS days_left
     FROM ingredients WHERE expiry_date IS NOT NULL AND expiry_date <> ''
     ORDER BY expiry_date ASC`,
    [todayKey()]
  )
  return rows.filter((r) => r.days_left <= withinDays)
}

export function stockValuation(): { rows: (Ingredient & { value: number })[]; total: number } {
  const rows = query<Ingredient & { value: number }>(
    `SELECT *, ROUND(current_stock * avg_cost, 2) AS value FROM ingredients ORDER BY value DESC`
  )
  return { rows, total: round2(rows.reduce((s, r) => s + (r.value || 0), 0)) }
}

/** Clean up orphaned movements when an ingredient row is hard-deleted elsewhere. */
export function purgeMovementsWithoutIngredient() {
  run('DELETE FROM inventory_movements WHERE ingredient_id NOT IN (SELECT id FROM ingredients)')
}

export { getDb }

/* ============================== Purchases ============================== */

export interface PurchaseDraftItem {
  ingredient_id: string | null
  ingredient_name: string
  quantity: number
  unit: string
  unit_price: number
}

export function listPurchases(search?: string): (Purchase & { item_count: number; supplier_name: string })[] {
  if (search?.trim()) {
    const q = `%${search.trim()}%`
    return query(
      `SELECT p.*, COALESCE(s.name, p.supplier_name) AS supplier_name,
        (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS item_count
       FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.supplier_name LIKE ? OR s.name LIKE ? OR p.notes LIKE ?
       ORDER BY p.purchase_date DESC, p.created_at DESC`,
      [q, q, q]
    )
  }
  return query(
    `SELECT p.*, COALESCE(s.name, p.supplier_name) AS supplier_name,
      (SELECT COUNT(*) FROM purchase_items pi WHERE pi.purchase_id = p.id) AS item_count
     FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
     ORDER BY p.purchase_date DESC, p.created_at DESC`
  )
}

export function getPurchaseItems(purchaseId: string): PurchaseItem[] {
  return query<PurchaseItem>('SELECT * FROM purchase_items WHERE purchase_id = ? ORDER BY id', [purchaseId])
}

export function createPurchase(input: {
  supplier_id: string | null
  supplier_name: string
  purchase_date: string
  payment_status: string
  notes: string
  items: PurchaseDraftItem[]
  received: boolean
}): Purchase {
  if (!input.items.length) throw new Error('Add at least one item to the purchase.')
  const id = uid('pur_')
  const total = round2(input.items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0))

  transaction(() => {
    run(
      `INSERT INTO purchases (id,supplier_id,supplier_name,purchase_date,total,payment_status,received,received_at,notes,created_at,is_sample)
       VALUES (?,?,?,?,?,?,?,?,?,?,0)`,
      [
        id,
        input.supplier_id,
        input.supplier_name,
        input.purchase_date,
        total,
        input.payment_status,
        input.received ? 1 : 0,
        input.received ? nowIso() : null,
        input.notes,
        nowIso(),
      ]
    )
    let movementReason = `Purchase received`
    for (const it of input.items) {
      const lineTotal = round2((it.quantity || 0) * (it.unit_price || 0))
      run(
        `INSERT INTO purchase_items (purchase_id, ingredient_id, ingredient_name, quantity, unit, unit_price, line_total)
         VALUES (?,?,?,?,?,?,?)`,
        [id, it.ingredient_id, it.ingredient_name, it.quantity, it.unit, it.unit_price, lineTotal]
      )
      if (input.received && it.ingredient_id) {
        applyMovement({
          ingredient_id: it.ingredient_id,
          movement_type: 'purchase',
          quantity: it.quantity,
          movement_date: input.purchase_date,
          reason: `${movementReason} — ${it.ingredient_name} (${it.quantity} ${it.unit})`,
          related_purchase_id: id,
        })
        // Refresh average purchase cost with a weighted running average.
        const ing = getIngredient(it.ingredient_id)
        if (ing && it.quantity > 0 && it.unit === ing.purchase_unit) {
          const prev = Number(ing.avg_cost) || 0
          const stock = Number(ing.current_stock) || 0
          const newAvg = stock > 0 ? round2((prev * (stock - it.quantity) + it.unit_price * it.quantity) / stock) : round2(it.unit_price)
          if (newAvg >= 0) run('UPDATE ingredients SET avg_cost = ? WHERE id = ?', [newAvg, it.ingredient_id])
        }
      }
    }
    logAudit('purchase', id, 'create', `${input.items.length} items, total ${total}, received=${input.received}`)
  })
  notifyDataChanged()
  return queryOne<Purchase>('SELECT * FROM purchases WHERE id = ?', [id])!
}

/**
 * Receiving is idempotent: a purchase that is already `received` never adds
 * stock again. Editing a received purchase inserts signed corrections instead.
 */
export function receivePurchase(id: string): Purchase {
  const purchase = queryOne<Purchase>('SELECT * FROM purchases WHERE id = ?', [id])
  if (!purchase) throw new Error('Purchase not found.')
  if (purchase.received) return purchase

  transaction(() => {
    run('UPDATE purchases SET received = 1, received_at = ? WHERE id = ?', [nowIso(), id])
    for (const it of getPurchaseItems(id)) {
      if (!it.ingredient_id) continue
      applyMovement({
        ingredient_id: it.ingredient_id,
        movement_type: 'purchase',
        quantity: it.quantity,
        movement_date: purchase.purchase_date,
        reason: `Purchase received — ${it.ingredient_name} (${it.quantity} ${it.unit})`,
        related_purchase_id: id,
      })
    }
    logAudit('purchase', id, 'receive')
  })
  notifyDataChanged()
  return queryOne<Purchase>('SELECT * FROM purchases WHERE id = ?', [id])!
}

export function updatePurchase(
  id: string,
  input: { supplier_id: string | null; supplier_name: string; purchase_date: string; payment_status: string; notes: string; items: PurchaseDraftItem[] }
) {
  const existing = queryOne<Purchase>('SELECT * FROM purchases WHERE id = ?', [id])
  if (!existing) throw new Error('Purchase not found.')
  if (!input.items.length) throw new Error('Add at least one item to the purchase.')
  const total = round2(input.items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0))

  transaction(() => {
    const before = new Map(getPurchaseItems(id).map((i) => [i.ingredient_id ?? `:${i.ingredient_name}`, i]))
    run(
      `UPDATE purchases SET supplier_id=?, supplier_name=?, purchase_date=?, total=?, payment_status=?, notes=? WHERE id=?`,
      [input.supplier_id, input.supplier_name, input.purchase_date, total, input.payment_status, input.notes, id]
    )
    run('DELETE FROM purchase_items WHERE purchase_id = ?', [id])
    const seen = new Set<string>()
    for (const it of input.items) {
      const key = it.ingredient_id ?? `:${it.ingredient_name}`
      seen.add(key)
      const lineTotal = round2((it.quantity || 0) * (it.unit_price || 0))
      run(
        `INSERT INTO purchase_items (purchase_id, ingredient_id, ingredient_name, quantity, unit, unit_price, line_total)
         VALUES (?,?,?,?,?,?,?)`,
        [id, it.ingredient_id, it.ingredient_name, it.quantity, it.unit, it.unit_price, lineTotal]
      )
      if (!it.ingredient_id) continue
      const prev = before.get(key)
      if (existing.received) {
        const delta = round2((it.quantity || 0) - (prev?.quantity ?? 0))
        if (Math.abs(delta) > 0.0001) {
          applyMovement({
            ingredient_id: it.ingredient_id,
            movement_type: 'correction',
            quantity: delta,
            movement_date: input.purchase_date,
            reason: `Correction after editing purchase ${existing.supplier_name || ''} (${it.ingredient_name})`.trim(),
            related_purchase_id: id,
          })
        }
        if (prev && it.ingredient_id && Math.abs((prev.unit_price ?? 0) - it.unit_price) > 0.0001) {
          run('UPDATE ingredients SET avg_cost = ? WHERE id = ?', [round2(it.unit_price), it.ingredient_id])
        }
      } else {
        // Not received yet — stock untouched, just refresh indicative cost.
        if (it.quantity > 0 && it.unit_price > 0) {
          run('UPDATE ingredients SET avg_cost = ? WHERE id = ?', [round2(it.unit_price), it.ingredient_id])
        }
      }
      if (prev && !existing.received) {
        // ingredient removed from a not-yet-received purchase: nothing to correct
      }
    }
    for (const key of before.keys()) {
      if (seen.has(key)) continue
      const prev = before.get(key)!
      if (existing.received && prev.ingredient_id && Math.abs(prev.quantity) > 0.0001) {
        applyMovement({
          ingredient_id: prev.ingredient_id,
          movement_type: 'correction',
          quantity: -prev.quantity,
          movement_date: input.purchase_date,
          reason: `Item removed from purchase ${existing.id}`,
          related_purchase_id: id,
        })
      }
    }
    logAudit('purchase', id, 'update', `received=${existing.received}`)
  })
  notifyDataChanged()
}

export function deletePurchase(id: string) {
  const existing = queryOne<Purchase>('SELECT * FROM purchases WHERE id = ?', [id])
  if (!existing) return
  transaction(() => {
    if (existing.received) {
      for (const it of getPurchaseItems(id)) {
        if (!it.ingredient_id) continue
        applyMovement({
          ingredient_id: it.ingredient_id,
          movement_type: 'correction',
          quantity: -it.quantity,
          reason: `Purchase ${id} was deleted — reversing received stock`,
          related_purchase_id: null,
        })
      }
    }
    run('UPDATE expenses SET related_purchase_id = NULL WHERE related_purchase_id = ?', [id])
    run('DELETE FROM purchase_items WHERE purchase_id = ?', [id])
    run('DELETE FROM purchases WHERE id = ?', [id])
    logAudit('purchase', id, 'delete', `reversed=${existing.received}`)
  })
  notifyDataChanged()
}

/* ============================== Waste ============================== */

export function listWaste(from?: string, to?: string): (WasteRecord & { batch_no: string | null })[] {
  const where: string[] = []
  const params: unknown[] = []
  if (from) {
    where.push('w.waste_date >= ?')
    params.push(from)
  }
  if (to) {
    where.push('w.waste_date <= ?')
    params.push(to)
  }
  return query(
    `SELECT w.*, b.batch_no AS batch_no
     FROM waste_records w LEFT JOIN production_batches b ON b.id = w.batch_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY w.waste_date DESC, w.created_at DESC`,
    params
  )
}

export function recordWaste(input: {
  waste_date: string
  waste_type: 'ingredient' | 'product'
  ingredient_id: string | null
  batch_id: string | null
  product_name: string
  quantity: number
  unit: string
  category: string
  reason: string
  value: number
  notes: string
  deduct_stock: boolean
}): WasteRecord {
  const id = uid('wst_')
  if (!input.quantity || input.quantity <= 0) throw new Error('Waste quantity must be greater than zero.')

  transaction(() => {
    const ingName = input.ingredient_id
      ? queryOne<{ name: string }>('SELECT name FROM ingredients WHERE id = ?', [input.ingredient_id])?.name ?? ''
      : ''
    const cols = [
      'id', 'waste_date', 'waste_type', 'ingredient_id', 'ingredient_name', 'batch_id', 'product_name',
      'quantity', 'unit', 'category', 'reason', 'value', 'movement_created', 'notes', 'created_at', 'is_sample',
    ]
    run(insertSql('waste_records', cols), [
      id,
      input.waste_date,
      input.waste_type,
      input.ingredient_id,
      ingName,
      input.batch_id,
      input.product_name,
      input.quantity,
      input.unit,
      input.category,
      input.reason,
      round2(input.value),
      input.deduct_stock && input.ingredient_id ? 1 : 0,
      input.notes,
      nowIso(),
      0,
    ])
    if (input.deduct_stock && input.ingredient_id) {
      applyMovement({
        ingredient_id: input.ingredient_id,
        movement_type: 'waste',
        quantity: -input.quantity,
        movement_date: input.waste_date,
        reason: `Waste: ${input.reason}`,
        related_waste_id: id,
        related_batch_id: input.batch_id,
      })
    }
    logAudit('waste', id, 'create', `${input.quantity} ${input.unit} — ${input.reason}`)
  })
  notifyDataChanged()
  return queryOne<WasteRecord>('SELECT * FROM waste_records WHERE id = ?', [id])!
}

export function deleteWaste(id: string) {
  const existing = queryOne<WasteRecord>('SELECT * FROM waste_records WHERE id = ?', [id])
  if (!existing) return
  transaction(() => {
    // Reversing the deduction keeps the ledger honest — we never erase history.
    if (existing.movement_created && existing.ingredient_id) {
      applyMovement({
        ingredient_id: existing.ingredient_id,
        movement_type: 'correction',
        quantity: existing.quantity,
        reason: `Waste record ${id} was deleted — stock restored`,
        related_waste_id: null,
      })
    }
    run('DELETE FROM waste_records WHERE id = ?', [id])
    logAudit('waste', id, 'delete')
  })
  notifyDataChanged()
}
