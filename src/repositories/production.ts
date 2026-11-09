import { query, queryOne, run, transaction, scalar, nowIso, logAudit, insertSql } from '../db/database'
import { uid, nextBatchNo } from '../lib/id'
import { round2 } from '../lib/money'
import { todayKey } from '../lib/dates'
import { notifyDataChanged } from '../store/app'
import type { ProductionBatch, ProductionConsumption, Recipe, Settings } from '../types'
import { expectedConsumption } from './recipes'
import { applyMovement } from './inventory'
import { getOrder, getOrderItems, setOrderStatus } from './orders'

export function listBatches(
  opts: { search?: string; status?: string; from?: string; to?: string; orderId?: string; includeSampleHidden?: boolean } = {}
): (ProductionBatch & { order_no: string | null })[] {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.status && opts.status !== 'All') {
    where.push('b.status = ?')
    params.push(opts.status)
  }
  if (opts.from) {
    where.push('date(b.production_date) >= date(?)')
    params.push(opts.from)
  }
  if (opts.to) {
    where.push('date(b.production_date) <= date(?)')
    params.push(opts.to)
  }
  if (opts.orderId) {
    where.push('b.order_id = ?')
    params.push(opts.orderId)
  }
  if (opts.search?.trim()) {
    where.push('(b.product_name LIKE ? OR b.recipe_name LIKE ? OR b.batch_no LIKE ? OR o.order_no LIKE ?)')
    const q = `%${opts.search.trim()}%`
    params.push(q, q, q, q)
  }
  return query(
    `SELECT b.*, o.order_no AS order_no
     FROM production_batches b LEFT JOIN orders o ON o.id = b.order_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY date(b.production_date) DESC, b.batch_no DESC`,
    params
  )
}

export function getBatch(id: string): ProductionBatch | undefined {
  return queryOne<ProductionBatch>('SELECT * FROM production_batches WHERE id = ?', [id])
}

export function getConsumption(batchId: string): ProductionConsumption[] {
  return query<ProductionConsumption>('SELECT * FROM production_consumption WHERE batch_id = ? ORDER BY id', [batchId])
}

function allocateBatchNo(): string {
  const rows = query<{ batch_no: string }>('SELECT batch_no FROM production_batches')
  let max = 0
  for (const r of rows) {
    const m = /(\d+)$/.exec(r.batch_no)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return nextBatchNo(max)
}

export interface BatchDraft {
  production_date: string
  order_id: string | null
  product_id: string | null
  product_name: string
  recipe_id: string | null
  recipe_name: string
  planned_qty: number
  actual_qty: number
  status: string
  priority: string
  start_time: string
  end_time: string
  labor_minutes: number
  waste_qty: number
  instructions: string
  notes: string
}

function snapshotRecipe(recipeId: string | null): string {
  if (!recipeId) return ''
  const recipe = queryOne<Recipe>('SELECT * FROM recipes WHERE id = ?', [recipeId])
  if (!recipe) return ''
  const lines = query('SELECT ingredient_name, quantity, unit FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order', [recipeId])
  // Snapshot so later recipe edits never rewrite what was actually produced.
  return JSON.stringify({ recipe, lines, snapshotted_at: nowIso() })
}

function validate(d: BatchDraft) {
  if (!d.production_date) throw new Error('Production date is required.')
  if (!(Number(d.planned_qty) > 0)) throw new Error('Planned quantity must be greater than zero.')
  if (d.actual_qty < 0 || Number.isNaN(d.actual_qty)) throw new Error('Actual quantity cannot be negative.')
}

export function createBatch(d: BatchDraft): ProductionBatch {
  validate(d)
  const id = uid('bat_')
  transaction(() => {
    const batchNo = allocateBatchNo()
    const cols = [
      'id', 'batch_no', 'production_date', 'order_id', 'product_id', 'product_name', 'recipe_id', 'recipe_name',
      'planned_qty', 'actual_qty', 'status', 'priority', 'start_time', 'end_time', 'labor_minutes', 'waste_qty',
      'instructions', 'notes', 'consumption_committed', 'recipe_snapshot', 'created_at', 'is_sample',
    ]
    run(insertSql('production_batches', cols), [
      id,
      batchNo,
      d.production_date,
      d.order_id,
      d.product_id,
      d.product_name ?? '',
      d.recipe_id,
      d.recipe_name ?? '',
      d.planned_qty,
      d.actual_qty || 0,
      d.status || 'Planned',
      d.priority || 'Normal',
      d.start_time ?? '',
      d.end_time ?? '',
      Number(d.labor_minutes) || 0,
      Number(d.waste_qty) || 0,
      d.instructions ?? '',
      d.notes ?? '',
      0,
      snapshotRecipe(d.recipe_id),
      nowIso(),
      0,
    ])
    logAudit('batch', id, 'create', `${batchNo} — ${d.product_name} × ${d.planned_qty}`)
    if (d.order_id) {
      const order = getOrder(d.order_id)
      if (order && (order.status === 'Confirmed' || order.status === 'Ready')) setOrderStatus(d.order_id, 'In Production')
    }
  })
  notifyDataChanged()
  return getBatch(id)!
}

export function updateBatch(id: string, d: BatchDraft) {
  const existing = getBatch(id)
  if (!existing) throw new Error('Batch not found.')
  validate(d)
  // A batch that already committed consumption never switches recipes — its
  // original snapshot is what was actually produced.
  if (existing.consumption_committed && d.recipe_id !== existing.recipe_id) {
    throw new Error(
      'This batch already consumed ingredients, so its recipe cannot be changed. Create a correction batch instead.'
    )
  }
  transaction(() => {
    run(
      `UPDATE production_batches SET production_date=?, order_id=?, product_id=?, product_name=?, recipe_id=?,
        recipe_name=?, planned_qty=?, actual_qty=?, status=?, priority=?, start_time=?, end_time=?,
        labor_minutes=?, waste_qty=?, instructions=?, notes=?, recipe_snapshot=? WHERE id=?`,
      [
        d.production_date,
        d.order_id,
        d.product_id,
        d.product_name ?? '',
        d.recipe_id,
        d.recipe_name ?? '',
        d.planned_qty,
        d.actual_qty || 0,
        d.status || existing.status,
        d.priority || 'Normal',
        d.start_time ?? '',
        d.end_time ?? '',
        Number(d.labor_minutes) || 0,
        Number(d.waste_qty) || 0,
        d.instructions ?? '',
        d.notes ?? '',
        d.recipe_id && d.recipe_id !== existing.recipe_id ? snapshotRecipe(d.recipe_id) : existing.recipe_snapshot,
        id,
      ]
    )
    logAudit('batch', id, 'update', existing.batch_no)
  })
  notifyDataChanged()
}

export function setBatchStatus(id: string, status: string) {
  const b = getBatch(id)
  if (!b) return
  run('UPDATE production_batches SET status = ? WHERE id = ?', [status, id])
  logAudit('batch', id, 'status', `${b.status} -> ${status}`)
  notifyDataChanged()
}

/* ====================== Ingredient consumption ====================== */

export function consumptionPreview(batchId: string): {
  lines: { ingredient_id: string | null; ingredient_name: string; unit: string; quantity: number; available: number; enough: boolean }[]
  committed: boolean
} {
  const batch = getBatch(batchId)
  if (!batch) return { lines: [], committed: false }
  if (!batch.recipe_id) return { lines: [], committed: batch.consumption_committed === 1 }
  const recipe = queryOne<Recipe>('SELECT * FROM recipes WHERE id = ?', [batch.recipe_id])
  if (!recipe) return { lines: [], committed: batch.consumption_committed === 1 }
  const qty = batch.actual_qty > 0 ? batch.actual_qty : batch.planned_qty
  const predicted = expectedConsumption(recipe, qty, {} as Settings)
  const lines = predicted.map((p) => {
    const stock = p.ingredient_id
      ? Number(queryOne<{ current_stock: number }>('SELECT current_stock FROM ingredients WHERE id = ?', [p.ingredient_id])?.current_stock ?? 0)
      : 0
    return {
      ingredient_id: p.ingredient_id,
      ingredient_name: p.ingredient_name,
      unit: p.unit,
      quantity: p.quantity,
      available: stock,
      enough: !p.ingredient_id || stock + 0.0001 >= p.quantity,
    }
  })
  return { lines, committed: batch.consumption_committed === 1 }
}

/**
 * Commits ingredient consumption for a completed batch — exactly once.
 * Re-running this on an already-committed batch is a no-op, which is how
 * "saving the same batch twice must not consume stock twice" is enforced.
 */
export function commitConsumption(batchId: string): { skipped: boolean; lines: number } {
  const batch = getBatch(batchId)
  if (!batch) throw new Error('Batch not found.')
  if (batch.consumption_committed) return { skipped: true, lines: 0 }
  if (!batch.recipe_id) return { skipped: true, lines: 0 }
  const recipe = queryOne<Recipe>('SELECT * FROM recipes WHERE id = ?', [batch.recipe_id])
  if (!recipe) return { skipped: true, lines: 0 }
  const qty = batch.actual_qty > 0 ? batch.actual_qty : batch.planned_qty
  if (!(qty > 0)) throw new Error('Enter the actual quantity produced before recording consumption.')

  const predicted = expectedConsumption(recipe, qty, {} as Settings)
  if (!predicted.length) throw new Error('This recipe has no ingredients linked, so nothing can be consumed.')

  transaction(() => {
    for (const p of predicted) {
      if (!p.ingredient_id) continue
      if (!(Math.abs(p.quantity) > 0)) continue
      run(
        `INSERT INTO production_consumption (batch_id, ingredient_id, ingredient_name, unit, quantity, unit_cost, total_cost, created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        [batchId, p.ingredient_id, p.ingredient_name, p.unit, p.quantity, p.unit_cost, p.total_cost, nowIso()]
      )
      applyMovement({
        ingredient_id: p.ingredient_id,
        movement_type: 'production_consumption',
        quantity: -p.quantity,
        movement_date: batch.production_date,
        reason: `Production ${batch.batch_no} — ${p.quantity} ${p.unit} of ${p.ingredient_name}`,
        related_batch_id: batchId,
        related_order_id: batch.order_id,
      })
    }
    run('UPDATE production_batches SET consumption_committed = 1 WHERE id = ?', [batchId])
    logAudit('batch', batchId, 'consumption_committed', `${predicted.filter((p) => p.ingredient_id).length} ingredients`)
  })
  notifyDataChanged()
  return { skipped: false, lines: predicted.filter((p) => p.ingredient_id).length }
}

/** Reverses consumption with traceable correction movements (history is kept). */
export function reverseConsumption(batchId: string): number {
  const batch = getBatch(batchId)
  if (!batch || !batch.consumption_committed) return 0
  let count = 0
  transaction(() => {
    const lines = getConsumption(batchId)
    for (const l of lines) {
      if (!l.ingredient_id) continue
      applyMovement({
        ingredient_id: l.ingredient_id,
        movement_type: 'correction',
        quantity: l.quantity,
        movement_date: todayKey(),
        reason: `Consumption reversed for batch ${batch.batch_no} — ${l.ingredient_name}`,
        related_batch_id: batchId,
      })
      count++
    }
    run('DELETE FROM production_consumption WHERE batch_id = ?', [batchId])
    run('UPDATE production_batches SET consumption_committed = 0 WHERE id = ?', [batchId])
    logAudit('batch', batchId, 'consumption_reversed', `${count} lines`)
  })
  notifyDataChanged()
  return count
}

export function deleteBatch(id: string) {
  const batch = getBatch(id)
  if (!batch) return
  transaction(() => {
    if (batch.consumption_committed) {
      const lines = getConsumption(id)
      for (const l of lines) {
        if (!l.ingredient_id) continue
        applyMovement({
          ingredient_id: l.ingredient_id,
          movement_type: 'correction',
          quantity: l.quantity,
          movement_date: todayKey(),
          reason: `Batch ${batch.batch_no} deleted — stock restored`,
        })
      }
    }
    run('DELETE FROM production_consumption WHERE batch_id = ?', [id])
    run('DELETE FROM production_batches WHERE id = ?', [id])
    logAudit('batch', id, 'delete', batch.batch_no)
  })
  notifyDataChanged()
}

/* ====================== Planning from orders ====================== */

export interface GeneratedTask {
  order_id: string
  product_id: string | null
  product_name: string
  recipe_id: string | null
  recipe_name: string
  quantity: number
}

/** Products on a confirmed order that can become production tasks. */
export function productionCandidates(orderId: string): GeneratedTask[] {
  const items = getOrderItems(orderId)
  return items.map((i) => {
    const recipe = i.recipe_id ? queryOne<Recipe>('SELECT name FROM recipes WHERE id = ?', [i.recipe_id]) : null
    return {
      order_id: orderId,
      product_id: i.product_id ?? null,
      product_name: i.product_name,
      recipe_id: i.recipe_id,
      recipe_name: recipe?.name ?? '',
      quantity: i.quantity,
    }
  })
}

export function createBatchesFromOrder(orderId: string, productionDate: string, onlyWithRecipe: boolean): number {
  const candidates = productionCandidates(orderId).filter((c) => (onlyWithRecipe ? !!c.recipe_id : true))
  if (!candidates.length) throw new Error('No order items are available to plan.')
  let created = 0
  transaction(() => {
    for (const c of candidates) {
      const item = getOrderItems(orderId).find((i) => i.product_name === c.product_name)
      const id = uid('bat_')
      const batchNo = allocateBatchNo()
      const cols = [
        'id', 'batch_no', 'production_date', 'order_id', 'product_id', 'product_name', 'recipe_id', 'recipe_name',
        'planned_qty', 'actual_qty', 'status', 'priority', 'start_time', 'end_time', 'labor_minutes', 'waste_qty',
        'instructions', 'notes', 'consumption_committed', 'recipe_snapshot', 'created_at', 'is_sample',
      ]
      run(insertSql('production_batches', cols), [
        id,
        batchNo,
        productionDate,
        orderId,
        item?.product_id ?? null,
        c.product_name,
        c.recipe_id,
        c.recipe_name,
        c.quantity,
        0,
        'Planned',
        'Normal',
        '',
        '',
        0,
        0,
        '',
        '',
        0,
        snapshotRecipe(c.recipe_id),
        nowIso(),
        0,
      ])
      created++
    }
    logAudit('order', orderId, 'production_planned', `${created} batches on ${productionDate}`)
    setOrderStatus(orderId, 'In Production')
  })
  notifyDataChanged()
  return created
}

export function batchStats(from?: string, to?: string) {
  const where: string[] = []
  const params: unknown[] = []
  if (from) {
    where.push('date(production_date) >= date(?)')
    params.push(from)
  }
  if (to) {
    where.push('date(production_date) <= date(?)')
    params.push(to)
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : ''
  const byStatus = query<{ status: string; c: number }>(`SELECT status, COUNT(*) AS c FROM production_batches ${w} GROUP BY status`, params)
  const totals = queryOne<{ planned: number | null; actual: number | null; wasted: number | null }>(
    `SELECT SUM(planned_qty) AS planned, SUM(actual_qty) AS actual, SUM(waste_qty) AS wasted FROM production_batches ${w}`,
    params
  )
  return {
    byStatus,
    planned: totals?.planned ?? 0,
    actual: totals?.actual ?? 0,
    wasted: totals?.wasted ?? 0,
    total: byStatus.reduce((s, r) => s + r.c, 0),
  }
}

export function pendingProductionCount(): number {
  return (
    scalar<number>(
      `SELECT COUNT(*) AS c FROM production_batches WHERE status NOT IN ('Completed','Failed','Cancelled')`
    ) ?? 0
  )
}
