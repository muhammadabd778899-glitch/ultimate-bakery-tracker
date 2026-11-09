import { query, queryOne, scalar } from '../db/database'
import { round2, pct } from '../lib/money'
import { todayKey, addDays, monthStart, startOfYear } from '../lib/dates'
import { lowStockIngredients, expiringIngredients, stockValuation } from './inventory'
import { getSettings } from './settings'

/** Orders are counted on their delivery/pickup date when they have one. */
const ORDER_DATE = 'COALESCE(o.due_date, substr(o.created_at,1,10))'
const NON_CANCELLED = `o.status <> 'Cancelled'`

/* ============================== Dashboard ============================== */

export interface Kpis {
  todayOrders: number
  upcomingDeliveries: number
  revenue: number
  estimatedProfit: number
  outstanding: number
  activeOrders: number
  lowStock: number
  pendingProduction: number
  paymentsReceived: number
  expenses: number
}

export function dashboardKpis(): Kpis {
  const today = todayKey()
  const in7 = addDays(today, 7)

  const todayOrders =
    scalar<number>(`SELECT COUNT(*) AS c FROM orders o WHERE ${NON_CANCELLED} AND archived_at IS NULL AND due_date = ?`, [today]) ?? 0

  const upcomingDeliveries =
    scalar<number>(
      `SELECT COUNT(*) AS c FROM orders o WHERE ${NON_CANCELLED} AND archived_at IS NULL
         AND date(due_date) > date(?) AND date(due_date) <= date(?) AND status NOT IN ('Completed')`,
      [today, in7]
    ) ?? 0

  const revenue = round2(
    scalar<number>(`SELECT COALESCE(SUM(total),0) AS t FROM orders o WHERE ${NON_CANCELLED} AND archived_at IS NULL`) ?? 0
  )

  const outstanding = round2(
    scalar<number>(
      `SELECT COALESCE(SUM(outstanding),0) AS t FROM orders o WHERE ${NON_CANCELLED} AND archived_at IS NULL AND outstanding > 0`
    ) ?? 0
  )

  const activeOrders =
    scalar<number>(
      `SELECT COUNT(*) AS c FROM orders WHERE archived_at IS NULL AND status NOT IN ('Completed','Cancelled')`
    ) ?? 0

  const paymentsReceived = round2(
    scalar<number>(`SELECT COALESCE(SUM(amount),0) AS t FROM order_payments WHERE type IN ('deposit','payment')`) ?? 0
  )
  const expenses = round2(scalar<number>('SELECT COALESCE(SUM(amount),0) AS t FROM expenses') ?? 0)
  const ingredientCost = round2(scalar<number>('SELECT COALESCE(SUM(total_cost),0) AS t FROM production_consumption') ?? 0)
  const refunds = round2(scalar<number>(`SELECT COALESCE(SUM(amount),0) AS t FROM order_payments WHERE type = 'refund'`) ?? 0)

  // Estimated, never presented as audited profit.
  const estimatedProfit = round2(revenue - ingredientCost - expenses - refunds)

  return {
    todayOrders,
    upcomingDeliveries,
    revenue,
    estimatedProfit,
    outstanding,
    activeOrders,
    lowStock: lowStockIngredients().length,
    pendingProduction:
      scalar<number>(`SELECT COUNT(*) AS c FROM production_batches WHERE status NOT IN ('Completed','Failed','Cancelled')`) ?? 0,
    paymentsReceived,
    expenses,
  }
}

export function revenueSeries(from: string, to: string): { label: string; revenue: number; payments: number }[] {
  const rows = query<{ label: string; revenue: number }>(
    `SELECT substr(${ORDER_DATE},1,7) AS label, COALESCE(SUM(o.total),0) AS revenue
     FROM orders o WHERE ${NON_CANCELLED} AND ${ORDER_DATE} BETWEEN ? AND ?
     GROUP BY label ORDER BY label ASC`,
    [from, to]
  )
  const pay = query<{ label: string; payments: number }>(
    `SELECT substr(paid_at,1,7) AS label,
            COALESCE(SUM(CASE WHEN type IN ('deposit','payment') THEN amount ELSE -amount END),0) AS payments
     FROM order_payments WHERE paid_at BETWEEN ? AND ? GROUP BY label`,
    [from, to]
  )
  const map = new Map<string, { label: string; revenue: number; payments: number }>()
  for (const r of rows) map.set(r.label, { label: r.label, revenue: round2(r.revenue), payments: 0 })
  for (const p of pay) {
    const existing = map.get(p.label) ?? { label: p.label, revenue: 0, payments: 0 }
    existing.payments = round2(p.payments)
    map.set(p.label, existing)
  }
  return [...map.values()].sort((a, b) => (a.label < b.label ? -1 : 1))
}

export interface ProductPerf {
  product_name: string
  units: number
  revenue: number
  orders: number
}

export function topProducts(limit = 6): ProductPerf[] {
  return query<ProductPerf>(
    `SELECT oi.product_name, COALESCE(SUM(oi.quantity),0) AS units, COALESCE(SUM(oi.line_total),0) AS revenue,
            COUNT(DISTINCT oi.order_id) AS orders
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE ${NON_CANCELLED}
     GROUP BY oi.product_name ORDER BY revenue DESC LIMIT ?`,
    [limit]
  )
}

export function statusDistribution(): { status: string; count: number }[] {
  return query<{ status: string; count: number }>(
    `SELECT status, COUNT(*) AS count FROM orders WHERE archived_at IS NULL GROUP BY status ORDER BY count DESC`
  )
}

export interface ActivityRow {
  id: number
  entity: string
  action: string
  detail: string
  created_at: string
}

export function recentActivity(limit = 8): ActivityRow[] {
  return query<ActivityRow>(`SELECT id, entity, action, detail, created_at FROM audit_logs ORDER BY id DESC LIMIT ?`, [limit])
}

export function productionSummary(limit = 6) {
  return query<{ id: string; batch_no: string; product_name: string; production_date: string; status: string; planned_qty: number; actual_qty: number }>(
    `SELECT id, batch_no, product_name, production_date, status, planned_qty, actual_qty
     FROM production_batches ORDER BY date(production_date) DESC, created_at DESC LIMIT ?`,
    [limit]
  )
}

/* ============================== Sales reports ============================== */

export function salesByPeriod(from: string, to: string, unit: 'day' | 'week' | 'month' = 'month') {
  const len = unit === 'day' ? 10 : unit === 'month' ? 7 : 10
  return query<{ period: string; revenue: number; orders: number; avg_order: number }>(
    `SELECT substr(${ORDER_DATE},1,${len}) AS period,
            ROUND(SUM(o.total),2) AS revenue,
            COUNT(*) AS orders,
            ROUND(AVG(o.total),2) AS avg_order
     FROM orders o WHERE ${NON_CANCELLED} AND ${ORDER_DATE} BETWEEN ? AND ?
     GROUP BY period ORDER BY period ASC`,
    [from, to]
  )
}

export function salesByProduct(from: string, to: string) {
  return query<{ product_name: string; units: number; revenue: number; orders: number }>(
    `SELECT oi.product_name, SUM(oi.quantity) AS units, ROUND(SUM(oi.line_total),2) AS revenue,
            COUNT(DISTINCT oi.order_id) AS orders
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE ${NON_CANCELLED} AND ${ORDER_DATE} BETWEEN ? AND ?
     GROUP BY oi.product_name ORDER BY revenue DESC`,
    [from, to]
  )
}

export function salesByCategory(from: string, to: string) {
  return query<{ category: string; revenue: number; units: number }>(
    `SELECT p.category_name AS category, ROUND(SUM(oi.line_total),2) AS revenue, SUM(oi.quantity) AS units
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN products p ON p.id = oi.product_id
     WHERE ${NON_CANCELLED} AND ${ORDER_DATE} BETWEEN ? AND ?
     GROUP BY category ORDER BY revenue DESC`,
    [from, to]
  )
}

export function salesByCustomer(from: string, to: string) {
  return query<{ customer_name: string; orders: number; revenue: number; paid: number }>(
    `SELECT o.customer_name, COUNT(*) AS orders, ROUND(SUM(o.total),2) AS revenue,
            ROUND(SUM(o.amount_paid),2) AS paid
     FROM orders o WHERE ${NON_CANCELLED} AND ${ORDER_DATE} BETWEEN ? AND ?
     GROUP BY o.customer_name ORDER BY revenue DESC`,
    [from, to]
  )
}

/* ============================== Order reports ============================== */

export function orderStats(from: string, to: string) {
  const row = queryOne<{ total: number; completed: number; cancelled: number; pending: number; avg_order: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status='Cancelled' THEN 1 ELSE 0 END) AS cancelled,
            SUM(CASE WHEN status NOT IN ('Completed','Cancelled') THEN 1 ELSE 0 END) AS pending,
            ROUND(AVG(CASE WHEN status<>'Cancelled' THEN total END),2) AS avg_order
     FROM orders o WHERE ${ORDER_DATE} BETWEEN ? AND ?`,
    [from, to]
  )
  const onTime = queryOne<{ total: number; ontime: number }>(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN status='Completed' AND due_date IS NOT NULL
                      AND date(COALESCE(cancelled_at, substr(created_at,1,10))) <= date(due_date)
                     THEN 1 ELSE 0 END) AS ontime
     FROM orders o WHERE status='Completed' AND due_date IS NOT NULL AND ${ORDER_DATE} BETWEEN ? AND ?`,
    [from, to]
  )
  return {
    total: row?.total ?? 0,
    completed: row?.completed ?? 0,
    cancelled: row?.cancelled ?? 0,
    pending: row?.pending ?? 0,
    avgOrder: round2(row?.avg_order ?? 0),
    onTimeRate: onTime && onTime.total ? pct(onTime.ontime ?? 0, onTime.total) : 0,
    onTimeTotal: onTime?.total ?? 0,
  }
}

/* ============================== Profitability ============================== */

export function profitabilityReport(from: string, to: string) {
  const revenue = round2(
    scalar<number>(
      `SELECT COALESCE(SUM(o.total),0) FROM orders o WHERE ${NON_CANCELLED} AND ${ORDER_DATE} BETWEEN ? AND ?`,
      [from, to]
    ) ?? 0
  )
  const cogs = round2(
    scalar<number>(
      `SELECT COALESCE(SUM(pc.total_cost),0)
       FROM production_consumption pc JOIN production_batches b ON b.id = pc.batch_id
       WHERE date(b.production_date) BETWEEN date(?) AND date(?)`,
      [from, to]
    ) ?? 0
  )
  const expenses = round2(
    scalar<number>(`SELECT COALESCE(SUM(amount),0) FROM expenses WHERE date(expense_date) BETWEEN date(?) AND date(?)`, [from, to]) ?? 0
  )
  const wasteValue = round2(
    scalar<number>(`SELECT COALESCE(SUM(value),0) FROM waste_records WHERE date(waste_date) BETWEEN date(?) AND date(?)`, [from, to]) ?? 0
  )
  return {
    revenue,
    cogs,
    expenses,
    wasteValue,
    grossProfit: round2(revenue - cogs),
    grossMargin: pct(revenue - cogs, revenue),
    estimatedNet: round2(revenue - cogs - expenses - wasteValue),
  }
}

export function expenseReport(from: string, to: string) {
  return query<{ category: string; total: number; count: number }>(
    `SELECT category, ROUND(SUM(amount),2) AS total, COUNT(*) AS count
     FROM expenses WHERE date(expense_date) BETWEEN date(?) AND date(?)
     GROUP BY category ORDER BY total DESC`,
    [from, to]
  )
}

/* ============================== Inventory reports ============================== */

export function inventoryReport() {
  const { rows, total } = stockValuation()
  const settings = getSettings()
  return {
    rows,
    valuationTotal: total,
    low: lowStockIngredients(),
    expiring: expiringIngredients(settings.expiry_warning_days || 7),
    totalCount: rows.length,
  }
}

export function consumptionReport(from: string, to: string) {
  return query<{ ingredient_name: string; unit: string; quantity: number; cost: number; batches: number }>(
    `SELECT pc.ingredient_name, pc.unit, ROUND(SUM(pc.quantity),3) AS quantity,
            ROUND(SUM(pc.total_cost),2) AS cost, COUNT(DISTINCT pc.batch_id) AS batches
     FROM production_consumption pc JOIN production_batches b ON b.id = pc.batch_id
     WHERE date(b.production_date) BETWEEN date(?) AND date(?)
     GROUP BY pc.ingredient_name, pc.unit ORDER BY cost DESC`,
    [from, to]
  )
}

export function wasteReport(from: string, to: string) {
  const byCategory = query<{ category: string; quantity: number; value: number; count: number }>(
    `SELECT category, ROUND(SUM(quantity),3) AS quantity, ROUND(SUM(value),2) AS value, COUNT(*) AS count
     FROM waste_records WHERE date(waste_date) BETWEEN date(?) AND date(?)
     GROUP BY category ORDER BY value DESC`,
    [from, to]
  )
  const byReason = query<{ reason: string; count: number; value: number }>(
    `SELECT reason, COUNT(*) AS count, ROUND(SUM(value),2) AS value
     FROM waste_records WHERE date(waste_date) BETWEEN date(?) AND date(?)
     GROUP BY reason ORDER BY count DESC`,
    [from, to]
  )
  const totals = queryOne<{ quantity: number; value: number; count: number }>(
    `SELECT ROUND(SUM(quantity),3) AS quantity, ROUND(SUM(value),2) AS value, COUNT(*) AS count
     FROM waste_records WHERE date(waste_date) BETWEEN date(?) AND date(?)`,
    [from, to]
  )
  const byMonth = query<{ month: string; value: number }>(
    `SELECT substr(waste_date,1,7) AS month, ROUND(SUM(value),2) AS value
     FROM waste_records WHERE date(waste_date) BETWEEN date(?) AND date(?)
     GROUP BY month ORDER BY month ASC`,
    [from, to]
  )
  return {
    byCategory,
    byReason,
    byMonth,
    totalQuantity: round2(totals?.quantity ?? 0),
    totalValue: round2(totals?.value ?? 0),
    count: totals?.count ?? 0,
  }
}

export function productionReport(from: string, to: string) {
  const byStatus = query<{ status: string; count: number }>(
    `SELECT status, COUNT(*) AS count FROM production_batches
     WHERE date(production_date) BETWEEN date(?) AND date(?)
     GROUP BY status ORDER BY count DESC`,
    [from, to]
  )
  const totals = queryOne<{ planned: number; actual: number; wasted: number; completed: number; failed: number }>(
    `SELECT COALESCE(SUM(planned_qty),0) AS planned, COALESCE(SUM(actual_qty),0) AS actual,
            COALESCE(SUM(waste_qty),0) AS wasted,
            SUM(CASE WHEN status='Completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status='Failed' THEN 1 ELSE 0 END) AS failed
     FROM production_batches WHERE date(production_date) BETWEEN date(?) AND date(?)`,
    [from, to]
  )
  const cost = round2(
    scalar<number>(
      `SELECT COALESCE(SUM(pc.total_cost),0) FROM production_consumption pc
       JOIN production_batches b ON b.id = pc.batch_id
       WHERE date(b.production_date) BETWEEN date(?) AND date(?)`,
      [from, to]
    ) ?? 0
  )
  return {
    byStatus,
    planned: totals?.planned ?? 0,
    actual: totals?.actual ?? 0,
    wasted: totals?.wasted ?? 0,
    completed: totals?.completed ?? 0,
    failed: totals?.failed ?? 0,
    ingredientCost: cost,
    yieldRate: pct(totals?.actual ?? 0, totals?.planned ?? 0),
  }
}

/* ============================== Customer insights ============================== */

export function customerInsights(from?: string, to?: string) {
  const where: string[] = [`status <> 'Cancelled'`, 'archived_at IS NULL']
  const params: unknown[] = []
  if (from) {
    where.push(`${ORDER_DATE} >= ?`)
    params.push(from)
  }
  if (to) {
    where.push(`${ORDER_DATE} <= ?`)
    params.push(to)
  }
  const repeat = query<{ customer_name: string; orders: number; revenue: number; outstanding: number }>(
    `SELECT customer_name, COUNT(*) AS orders, ROUND(SUM(total),2) AS revenue, ROUND(SUM(outstanding),2) AS outstanding
     FROM orders o WHERE ${where.join(' AND ')} GROUP BY customer_name
     HAVING COUNT(*) > 1 ORDER BY revenue DESC LIMIT 50`,
    params
  )
  const oneTimer = scalar<number>(
    `SELECT COUNT(*) FROM (SELECT customer_name FROM orders o WHERE ${where.join(' AND ')}
      GROUP BY customer_name HAVING COUNT(*) = 1)`,
    params
  )
  const noContact = scalar<number>(`SELECT COUNT(*) AS c FROM customers WHERE archived_at IS NULL`) ?? 0
  return { repeat, oneTime: oneTimer ?? 0, customers: noContact }
}

/* ============================== Misc ============================== */

export function pendingTasks() {
  return query<{ id: string; title: string; due_date: string | null; priority: string; status: string }>(
    `SELECT id, title, due_date, priority, status FROM tasks
     WHERE status <> 'Completed' ORDER BY date(due_date) IS NULL, date(due_date) ASC LIMIT 6`
  )
}

export function defaultRange(days = 30): { from: string; to: string } {
  const to = todayKey()
  return { from: addDays(to, -days), to }
}

export function yearRange(): { from: string; to: string } {
  return { from: startOfYear(todayKey()), to: todayKey() }
}

export function monthRange(): { from: string; to: string } {
  return { from: monthStart(todayKey()), to: todayKey() }
}
