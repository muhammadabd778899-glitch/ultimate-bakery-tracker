import { query, queryOne, run, transaction, scalar, nowIso, logAudit } from '../db/database'
import { uid, nextOrderNo } from '../lib/id'
import { round2 } from '../lib/money'
import { todayKey } from '../lib/dates'
import { computeOrderTotals, paymentStatusFor } from '../lib/calc'
import { notifyDataChanged } from '../store/app'
import type { Order, OrderItem, OrderPayment, OrderStatus, Product, Settings } from '../types'

export interface OrderDraftItem {
  product_id: string | null
  product_name: string
  recipe_id: string | null
  unit_price: number
  quantity: number
  customization: string
}

export interface OrderDraft {
  customer_id: string | null
  customer_name: string
  due_date: string | null
  due_time: string
  order_type: string
  status: OrderStatus
  discount: number
  tax_rate: number
  delivery_fee: number
  special_instructions: string
  customer_notes: string
  internal_notes: string
  items: OrderDraftItem[]
}

/* ============================== Queries ============================== */

export interface OrderRow extends Order {
  item_count: number
}

export function listOrders(
  opts: {
    search?: string
    status?: string
    paymentStatus?: string
    from?: string
    to?: string
    customerId?: string
    includeArchived?: boolean
    limit?: number
  } = {}
): OrderRow[] {
  const where: string[] = []
  const params: unknown[] = []
  if (!opts.includeArchived) where.push('o.archived_at IS NULL')
  if (opts.status && opts.status !== 'All') {
    where.push('o.status = ?')
    params.push(opts.status)
  }
  if (opts.paymentStatus && opts.paymentStatus !== 'All') {
    where.push('o.payment_status = ?')
    params.push(opts.paymentStatus)
  }
  if (opts.from) {
    where.push('date(o.due_date) >= date(?)')
    params.push(opts.from)
  }
  if (opts.to) {
    where.push('date(o.due_date) <= date(?)')
    params.push(opts.to)
  }
  if (opts.customerId) {
    where.push('o.customer_id = ?')
    params.push(opts.customerId)
  }
  if (opts.search?.trim()) {
    where.push('(o.order_no LIKE ? OR o.customer_name LIKE ? OR o.internal_notes LIKE ? OR EXISTS (SELECT 1 FROM order_items oi WHERE oi.order_id = o.id AND oi.product_name LIKE ?))')
    const q = `%${opts.search.trim()}%`
    params.push(q, q, q, q)
  }
  const sql = `
    SELECT o.*, (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
    FROM orders o
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY COALESCE(o.due_date, substr(o.created_at,1,10)) DESC, o.created_at DESC
    ${opts.limit ? 'LIMIT ' + opts.limit : ''}`
  return query<OrderRow>(sql, params)
}

export function getOrder(id: string): Order | undefined {
  return queryOne<Order>('SELECT * FROM orders WHERE id = ?', [id])
}

export function getOrderItems(orderId: string): OrderItem[] {
  return query<OrderItem>('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orderId])
}

export function getOrderPayments(orderId: string): OrderPayment[] {
  return query<OrderPayment>('SELECT * FROM order_payments WHERE order_id = ? ORDER BY paid_at DESC, created_at DESC', [orderId])
}

export function orderTimeline(orderId: string): { action: string; detail: string; at: string }[] {
  const payments = getOrderPayments(orderId).map((p) => ({
    action: p.type === 'refund' ? 'Refund recorded' : p.type === 'deposit' ? 'Deposit recorded' : 'Payment recorded',
    detail: p.notes || p.method,
    at: p.paid_at,
  }))
  const audits = query<{ action: string; detail: string; created_at: string }>(
    `SELECT action, detail, created_at FROM audit_logs WHERE entity = 'order' AND entity_id = ? ORDER BY id DESC`,
    [orderId]
  ).map((a) => ({ action: a.action.replace('_', ' '), detail: a.detail, at: a.created_at }))
  return [...payments, ...audits].sort((a, b) => (a.at < b.at ? 1 : -1))
}

/* ============================== Write ============================== */

function totalsFor(items: OrderDraftItem[], discount: number, tax_rate: number, delivery_fee: number) {
  const subtotal = round2(items.reduce((s, i) => s + (Number(i.unit_price) || 0) * (Number(i.quantity) || 0), 0))
  return computeOrderTotals({ subtotal, discount, tax_rate, delivery_fee })
}

function paidFor(orderId: string): number {
  const row = queryOne<{ net: number | null }>(
    `SELECT SUM(CASE WHEN type IN ('deposit','payment') THEN amount ELSE -amount END) AS net
     FROM order_payments WHERE order_id = ?`,
    [orderId]
  )
  return round2(row?.net ?? 0)
}

function syncOrderMoney(orderId: string) {
  const o = getOrder(orderId)
  if (!o) return
  const paid = paidFor(orderId)
  const outstanding = round2(o.total - paid)
  const status = paymentStatusFor(o.total, paid)
  run('UPDATE orders SET amount_paid = ?, outstanding = ?, payment_status = ? WHERE id = ?', [
    paid,
    outstanding,
    status,
    orderId,
  ])
}

function allocateOrderNo(): string {
  const rows = query<{ order_no: string }>(`SELECT order_no FROM orders`)
  let max = 0
  const re = /(\d+)$/
  for (const r of rows) {
    const m = re.exec(r.order_no)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return nextOrderNo(max)
}

function writeItems(orderId: string, items: OrderDraftItem[]) {
  run('DELETE FROM order_items WHERE order_id = ?', [orderId])
  for (const it of items) {
    const lineTotal = round2((Number(it.unit_price) || 0) * (Number(it.quantity) || 0))
    run(
      `INSERT INTO order_items (order_id, product_id, product_name, recipe_id, unit_price, quantity, customization, line_total)
       VALUES (?,?,?,?,?,?,?,?)`,
      [orderId, it.product_id, it.product_name, it.recipe_id, it.unit_price, it.quantity, it.customization ?? '', lineTotal]
    )
  }
}

/**
 * Creating an order NEVER touches inventory. Stock is only consumed when
 * production is recorded as completed (see production repo).
 */
export function createOrder(d: OrderDraft, settings: Settings): Order {
  if (!d.items?.length) throw new Error('Add at least one product to the order.')
  for (const it of d.items) {
    if (!it.product_name?.trim()) throw new Error('Every order line needs a product name.')
    if (!(Number(it.quantity) > 0)) throw new Error(`Quantity for ${it.product_name} must be greater than zero.`)
    if (Number(it.unit_price) < 0) throw new Error(`Price for ${it.product_name} cannot be negative.`)
  }
  const id = uid('ord_')
  const totals = totalsFor(d.items, d.discount, d.tax_rate, d.delivery_fee)

  transaction(() => {
    const orderNo = allocateOrderNo()
    run(
      `INSERT INTO orders (id,order_no,customer_id,customer_name,created_at,due_date,due_time,order_type,status,payment_status,
        subtotal,discount,tax_rate,tax_amount,delivery_fee,total,amount_paid,outstanding,special_instructions,customer_notes,
        internal_notes,cancelled_at,archived_at,is_sample)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,0)`,
      // 22 bound columns, then archived_at = NULL, is_sample = 0
      [
        id,
        orderNo,
        d.customer_id,
        d.customer_name ?? '',
        nowIso(),
        d.due_date,
        d.due_time ?? '',
        d.order_type || 'pickup',
        d.status || 'Confirmed',
        'Unpaid',
        totals.subtotal,
        totals.discount,
        totals.tax_rate ?? 0,
        totals.tax_amount,
        totals.delivery_fee,
        totals.total,
        0,
        totals.total,
        d.special_instructions ?? '',
        d.customer_notes ?? '',
        d.internal_notes ?? '',
        d.status === 'Cancelled' ? nowIso() : null,
      ]
    )
    writeItems(id, d.items)
    logAudit('order', id, 'create', `${orderNo} — ${d.customer_name} — total ${totals.total}`)
    syncOrderMoney(id)
  })
  notifyDataChanged()
  return getOrder(id)!
}

export function updateOrder(id: string, d: OrderDraft) {
  const existing = getOrder(id)
  if (!existing) throw new Error('Order not found.')
  if (!d.items?.length) throw new Error('Add at least one product to the order.')
  for (const it of d.items) {
    if (!(Number(it.quantity) > 0)) throw new Error(`Quantity for ${it.product_name} must be greater than zero.`)
  }
  const totals = totalsFor(d.items, d.discount, d.tax_rate, d.delivery_fee)

  transaction(() => {
    run(
      `UPDATE orders SET customer_id=?, customer_name=?, due_date=?, due_time=?, order_type=?, status=?,
        subtotal=?, discount=?, tax_rate=?, tax_amount=?, delivery_fee=?, total=?,
        special_instructions=?, customer_notes=?, internal_notes=?, cancelled_at=? WHERE id=?`,
      [
        d.customer_id,
        d.customer_name ?? '',
        d.due_date,
        d.due_time ?? '',
        d.order_type || 'pickup',
        d.status || existing.status,
        totals.subtotal,
        totals.discount,
        totals.tax_rate ?? 0,
        totals.tax_amount,
        totals.delivery_fee,
        totals.total,
        d.special_instructions ?? '',
        d.customer_notes ?? '',
        d.internal_notes ?? '',
        d.status === 'Cancelled' ? existing.cancelled_at ?? nowIso() : null,
        id,
      ]
    )
    writeItems(id, d.items)
    logAudit('order', id, 'update', existing.order_no)
    syncOrderMoney(id)
  })
  notifyDataChanged()
}

export function setOrderStatus(id: string, status: OrderStatus) {
  const existing = getOrder(id)
  if (!existing) return
  run('UPDATE orders SET status = ?, cancelled_at = ? WHERE id = ?', [
    status,
    status === 'Cancelled' ? nowIso() : null,
    id,
  ])
  logAudit('order', id, 'status', `${existing.status} -> ${status}`)
  notifyDataChanged()
}

export function archiveOrder(id: string, archived: boolean) {
  run('UPDATE orders SET archived_at = ? WHERE id = ?', [archived ? nowIso() : null, id])
  logAudit('order', id, archived ? 'archive' : 'restore')
  notifyDataChanged()
}

export function duplicateOrder(id: string, settings: Settings): Order | undefined {
  const src = getOrder(id)
  if (!src) return undefined
  const items = getOrderItems(id)
  return createOrder(
    {
      customer_id: src.customer_id,
      customer_name: src.customer_name,
      due_date: src.due_date,
      due_time: src.due_time,
      order_type: src.order_type,
      status: 'Inquiry',
      discount: src.discount,
      tax_rate: src.tax_rate,
      delivery_fee: src.delivery_fee,
      special_instructions: src.special_instructions,
      customer_notes: src.customer_notes,
      internal_notes: src.internal_notes,
      items: items.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        recipe_id: i.recipe_id,
        unit_price: i.unit_price,
        quantity: i.quantity,
        customization: i.customization,
      })),
    },
    settings
  )
}

/**
 * Deleting an order is refused when money or production history depends on it.
 * Archiving is always available and never destroys history.
 */
export function deleteOrder(id: string): void {
  const existing = getOrder(id)
  if (!existing) return
  const payments = scalar<number>('SELECT COUNT(*) AS c FROM order_payments WHERE order_id = ?', [id]) ?? 0
  const batches = scalar<number>('SELECT COUNT(*) AS c FROM production_batches WHERE order_id = ?', [id]) ?? 0
  if (payments > 0) {
    throw new Error(
      `This order has ${payments} payment record(s). Record a refund instead, or archive the order — payment history is never deleted.`
    )
  }
  if (batches > 0) {
    throw new Error(
      `This order has ${batches} production batch(es) linked to it. Archive the order instead so production history stays intact.`
    )
  }
  transaction(() => {
    run('UPDATE tasks SET related_order_id = NULL WHERE related_order_id = ?', [id])
    run('UPDATE events SET related_order_id = NULL WHERE related_order_id = ?', [id])
    run('DELETE FROM order_items WHERE order_id = ?', [id])
    run('DELETE FROM orders WHERE id = ?', [id])
    logAudit('order', id, 'delete', existing.order_no)
  })
  notifyDataChanged()
}

/* ============================== Payments ============================== */

export function recordPayment(input: {
  order_id: string
  amount: number
  type: 'deposit' | 'payment' | 'refund'
  method: string
  paid_at: string
  notes: string
}): OrderPayment {
  const order = getOrder(input.order_id)
  if (!order) throw new Error('Order not found.')
  const amount = round2(Number(input.amount))
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.')

  const paid = paidFor(input.order_id)
  if (input.type !== 'refund' && amount > paid + order.total + 0.004) {
    throw new Error('That is more than the order total.')
  }

  const id = uid('pay_')
  transaction(() => {
    run(
      `INSERT INTO order_payments (id, order_id, amount, type, method, paid_at, notes, created_at) VALUES (?,?,?,?,?,?,?,?)`,
      [id, input.order_id, amount, input.type, input.method || 'Cash', input.paid_at || todayKey(), input.notes ?? '', nowIso()]
    )
    logAudit('order', input.order_id, input.type === 'refund' ? 'refund' : 'payment', `${amount} via ${input.method}`)
    syncOrderMoney(input.order_id)
  })
  notifyDataChanged()
  return queryOne<OrderPayment>('SELECT * FROM order_payments WHERE id = ?', [id])!
}

export function voidPayment(paymentId: string) {
  const p = queryOne<OrderPayment>('SELECT * FROM order_payments WHERE id = ?', [paymentId])
  if (!p) throw new Error('Payment not found.')
  transaction(() => {
    run('DELETE FROM order_payments WHERE id = ?', [paymentId])
    logAudit('order', p.order_id, 'payment_voided', `${p.type} ${p.amount}`)
    syncOrderMoney(p.order_id)
  })
  notifyDataChanged()
}

/* ============================== Derived helpers ============================== */

export function productCatalogForOrder(): (Product & { recipe_name: string | null })[] {
  return query<Product & { recipe_name: string }>(
    `SELECT p.*, r.name AS recipe_name FROM products p LEFT JOIN recipes r ON r.id = p.recipe_id
     WHERE p.availability = 'active' ORDER BY p.name COLLATE NOCASE ASC`
  )
}

export function nextOrderNumberPreview(): string {
  const rows = query<{ order_no: string }>('SELECT order_no FROM orders')
  let max = 0
  const re = /(\d+)$/
  for (const r of rows) {
    const m = re.exec(r.order_no)
    if (m) max = Math.max(max, parseInt(m[1], 10))
  }
  return nextOrderNo(max)
}
