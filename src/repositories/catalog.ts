import { query, queryOne, run, transaction, nowIso, logAudit } from '../db/database'
import { uid } from '../lib/id'
import { round2 } from '../lib/money'
import { notifyDataChanged } from '../store/app'
import type { Customer, Product, ProductCategory, Supplier } from '../types'

/* ============================== Customers ============================== */

export interface CustomerStats {
  total_orders: number
  total_spent: number
  outstanding: number
  last_order: string | null
}

export function listCustomers(opts: { search?: string; includeArchived?: boolean } = {}): (Customer & CustomerStats)[] {
  const where: string[] = []
  const params: unknown[] = []
  if (!opts.includeArchived) where.push('c.archived_at IS NULL')
  if (opts.search?.trim()) {
    where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)')
    const q = `%${opts.search.trim()}%`
    params.push(q, q, q)
  }
  const sql = `
    SELECT c.*,
      COALESCE(os.total_orders,0) AS total_orders,
      COALESCE(os.total_spent,0)  AS total_spent,
      COALESCE(os.outstanding,0)  AS outstanding,
      os.last_order
    FROM customers c
    LEFT JOIN (
      SELECT customer_id,
             COUNT(*) AS total_orders,
             SUM(CASE WHEN status <> 'Cancelled' THEN total ELSE 0 END) AS total_spent,
             SUM(CASE WHEN status <> 'Cancelled' THEN outstanding ELSE 0 END) AS outstanding,
             MAX(created_at) AS last_order
      FROM orders WHERE archived_at IS NULL GROUP BY customer_id
    ) os ON os.customer_id = c.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY c.name COLLATE NOCASE ASC`
  return query(sql, params)
}

export function findDuplicateCustomer(name: string, phone: string): Customer | undefined {
  const n = name.trim().toLowerCase()
  if (phone?.trim()) {
    const byPhone = queryOne<Customer>('SELECT * FROM customers WHERE phone = ? AND archived_at IS NULL', [
      phone.trim(),
    ])
    if (byPhone) return byPhone
  }
  if (!n) return undefined
  return queryOne<Customer>('SELECT * FROM customers WHERE LOWER(TRIM(name)) = ? AND archived_at IS NULL', [n])
}

export function createCustomer(input: Partial<Customer>): Customer {
  const id = uid('cus_')
  run(
    `INSERT INTO customers (id,name,phone,email,address,notes,created_at,is_sample) VALUES (?,?,?,?,?,?,?,0)`,
    [id, input.name?.trim() ?? '', input.phone?.trim() ?? '', input.email?.trim() ?? '', input.address?.trim() ?? '', input.notes?.trim() ?? '', nowIso()]
  )
  logAudit('customer', id, 'create', input.name)
  notifyDataChanged()
  return queryOne<Customer>('SELECT * FROM customers WHERE id = ?', [id])!
}

export function updateCustomer(id: string, input: Partial<Customer>) {
  run(`UPDATE customers SET name=?, phone=?, email=?, address=?, notes=? WHERE id=?`, [
    input.name?.trim() ?? '',
    input.phone?.trim() ?? '',
    input.email?.trim() ?? '',
    input.address?.trim() ?? '',
    input.notes?.trim() ?? '',
    id,
  ])
  logAudit('customer', id, 'update', input.name)
  notifyDataChanged()
}

export function archiveCustomer(id: string, archived: boolean) {
  run('UPDATE customers SET archived_at = ? WHERE id = ?', [archived ? nowIso() : null, id])
  logAudit('customer', id, archived ? 'archive' : 'restore')
  notifyDataChanged()
}

export function deleteCustomer(id: string) {
  // Dependent orders keep a name snapshot, so history survives.
  transaction(() => {
    run('UPDATE orders SET customer_id = NULL WHERE customer_id = ?', [id])
    run('DELETE FROM customers WHERE id = ?', [id])
  })
  logAudit('customer', id, 'delete')
  notifyDataChanged()
}

export function getCustomer(id: string): Customer | undefined {
  return queryOne<Customer>('SELECT * FROM customers WHERE id = ?', [id])
}

/* ============================== Products ============================== */

export interface ProductPerformance {
  units_sold: number
  revenue: number
  orders_count: number
}

export function listProducts(opts: { search?: string; categoryId?: number; activeOnly?: boolean } = {}): (Product & ProductPerformance & {
  recipe_name: string | null
  estimated_cost: number | null
})[] {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.search?.trim()) {
    where.push('(p.name LIKE ? OR p.description LIKE ?)')
    params.push(`%${opts.search.trim()}%`, `%${opts.search.trim()}%`)
  }
  if (opts.categoryId) {
    where.push('p.category_id = ?')
    params.push(opts.categoryId)
  }
  if (opts.activeOnly) where.push(`p.availability = 'active'`)
  const sql = `
    SELECT p.*, r.name AS recipe_name,
      COALESCE(perf.units_sold,0) AS units_sold,
      COALESCE(perf.revenue,0)    AS revenue,
      COALESCE(perf.orders_count,0) AS orders_count
    FROM products p
    LEFT JOIN recipes r ON r.id = p.recipe_id
    LEFT JOIN (
      SELECT oi.product_id,
             SUM(oi.quantity) AS units_sold,
             SUM(oi.line_total) AS revenue,
             COUNT(DISTINCT oi.order_id) AS orders_count
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status <> 'Cancelled'
      GROUP BY oi.product_id
    ) perf ON perf.product_id = p.id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY p.name COLLATE NOCASE ASC`
  return query(sql, params)
}

export function listCategories(): ProductCategory[] {
  return query('SELECT * FROM product_categories ORDER BY sort_order ASC, name ASC')
}

export function addCategory(name: string): number {
  const clean = name.trim()
  if (!clean) throw new Error('Category name is required.')
  const exists = queryOne<ProductCategory>('SELECT * FROM product_categories WHERE LOWER(name) = ?', [clean.toLowerCase()])
  if (exists) return exists.id
  run('INSERT INTO product_categories (name, is_system, sort_order) VALUES (?,0,?)', [clean, 100 + (listCategories().length)])
  logAudit('product_category', null, 'create', clean)
  notifyDataChanged()
  return queryOne<ProductCategory>('SELECT * FROM product_categories WHERE name = ?', [clean])!.id
}

export function deleteCategory(id: number) {
  run('DELETE FROM product_categories WHERE id = ? AND is_system = 0', [id])
  run(`UPDATE products SET category_id = NULL, category_name = 'Other' WHERE category_id = ?`, [id])
  logAudit('product_category', String(id), 'delete')
  notifyDataChanged()
}

export function createProduct(input: Partial<Product>): Product {
  const id = uid('prd_')
  run(
    `INSERT INTO products (id,name,category_id,category_name,description,selling_price,recipe_id,unit_of_sale,availability,lead_time_days,notes,image_path,created_at,is_sample)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
    [
      id,
      input.name?.trim() ?? '',
      input.category_id ?? null,
      input.category_name ?? 'Other',
      input.description ?? '',
      round2(input.selling_price ?? 0),
      input.recipe_id ?? null,
      input.unit_of_sale || 'each',
      input.availability || 'active',
      Number(input.lead_time_days) || 0,
      input.notes ?? '',
      input.image_path ?? '',
      nowIso(),
    ]
  )
  logAudit('product', id, 'create', input.name)
  notifyDataChanged()
  return queryOne<Product>('SELECT * FROM products WHERE id = ?', [id])!
}

export function updateProduct(id: string, input: Partial<Product>) {
  run(
    `UPDATE products SET name=?, category_id=?, category_name=?, description=?, selling_price=?, recipe_id=?,
      unit_of_sale=?, availability=?, lead_time_days=?, notes=? WHERE id=?`,
    [
      input.name?.trim() ?? '',
      input.category_id ?? null,
      input.category_name ?? 'Other',
      input.description ?? '',
      round2(input.selling_price ?? 0),
      input.recipe_id ?? null,
      input.unit_of_sale || 'each',
      input.availability || 'active',
      Number(input.lead_time_days) || 0,
      input.notes ?? '',
      id,
    ]
  )
  logAudit('product', id, 'update', input.name)
  notifyDataChanged()
}

export function deleteProduct(id: string) {
  transaction(() => {
    run('UPDATE order_items SET product_id = NULL WHERE product_id = ?', [id])
    run('DELETE FROM products WHERE id = ?', [id])
  })
  logAudit('product', id, 'delete')
  notifyDataChanged()
}

/* ============================== Suppliers ============================== */

export function listSuppliers(search?: string): Supplier[] {
  if (search?.trim()) {
    const q = `%${search.trim()}%`
    return query('SELECT * FROM suppliers WHERE name LIKE ? OR contact_person LIKE ? OR phone LIKE ? ORDER BY name', [q, q, q])
  }
  return query('SELECT * FROM suppliers ORDER BY name COLLATE NOCASE ASC')
}

export function createSupplier(input: Partial<Supplier>): Supplier {
  const id = uid('sup_')
  run(
    `INSERT INTO suppliers (id,name,contact_person,phone,email,address,notes,created_at,is_sample) VALUES (?,?,?,?,?,?,?,?,0)`,
    [id, input.name?.trim() ?? '', input.contact_person ?? '', input.phone ?? '', input.email ?? '', input.address ?? '', input.notes ?? '', nowIso()]
  )
  logAudit('supplier', id, 'create', input.name)
  notifyDataChanged()
  return queryOne<Supplier>('SELECT * FROM suppliers WHERE id = ?', [id])!
}

export function updateSupplier(id: string, input: Partial<Supplier>) {
  run(`UPDATE suppliers SET name=?, contact_person=?, phone=?, email=?, address=?, notes=? WHERE id=?`, [
    input.name?.trim() ?? '',
    input.contact_person ?? '',
    input.phone ?? '',
    input.email ?? '',
    input.address ?? '',
    input.notes ?? '',
    id,
  ])
  logAudit('supplier', id, 'update', input.name)
  notifyDataChanged()
}

export function deleteSupplier(id: string) {
  run('UPDATE purchases SET supplier_id = NULL WHERE supplier_id = ?', [id])
  run('UPDATE ingredients SET supplier_id = NULL WHERE supplier_id = ?', [id])
  run('DELETE FROM suppliers WHERE id = ?', [id])
  logAudit('supplier', id, 'delete')
  notifyDataChanged()
}
