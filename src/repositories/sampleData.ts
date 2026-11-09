import { query, queryOne, run, transaction, nowIso, insertSql, logAudit } from '../db/database'
import { uid } from '../lib/id'
import { todayKey, addDays } from '../lib/dates'
import { round2 } from '../lib/money'
import { computeOrderTotals, paymentStatusFor } from '../lib/calc'
import { notifyDataChanged } from '../store/app'
import { sampleDataExists } from './backup'

/**
 * Optional demo bakery. Every row is flagged `is_sample = 1` and can be removed
 * in one click from Settings → Sample data. It is never mixed into a real
 * business' records silently.
 */
export function seedSampleData(): { created: boolean } {
  if (sampleDataExists()) return { created: false }

  const t = todayKey()
  const d = (n: number) => addDays(t, n)

  transaction(() => {
    /* ---------- ingredients ---------- */
    const ing: [string, string, string, number, number, number][] = [
      // name, category, unit, stock, min, avg cost
      ['Plain Flour', 'Flour and grains', 'kg', 25, 5, 1.4],
      ['Granulated Sugar', 'Sugar and sweeteners', 'kg', 18, 4, 1.1],
      ['Unsalted Butter', 'Dairy', 'kg', 8, 2, 6.5],
      ['Whole Milk', 'Dairy', 'L', 12, 3, 1.2],
      ['Eggs', 'Dairy', 'pcs', 60, 24, 0.35],
      ['Cocoa Powder', 'Chocolate and cocoa', 'kg', 2, 1, 9.0],
      ['Dark Chocolate', 'Chocolate and cocoa', 'kg', 3, 1, 12.0],
      ['Baking Powder', 'Baking supplies', 'kg', 1.5, 0.5, 4.2],
      ['Vanilla Extract', 'Flavorings', 'L', 0.8, 0.25, 22.0],
      ['Salt', 'Baking supplies', 'kg', 2, 0.5, 0.8],
      ['Sprinkle Packs', 'Packaging', 'pack', 6, 3, 2.5],
      ['Cake Boxes', 'Packaging', 'pcs', 30, 10, 0.7],
    ]
    const ingIds: Record<string, string> = {}
    for (const [name, cat, unit, stock, min, cost] of ing) {
      const id = uid('ing_')
      run(insertSql('ingredients', ['id','name','category','purchase_unit','current_stock','min_stock','reorder_qty','avg_cost','supplier_id','storage_location','expiry_date','notes','created_at','is_sample']), [
        id, name, cat, unit, 0, min, min * 2, cost, null, '', null, 'Sample record', nowIso(), 1,
      ])
      ingIds[name] = id
      run(
        `INSERT INTO inventory_movements (ingredient_id, movement_type, quantity, stock_after, movement_date, reason, created_at)
         VALUES (?,?,?,?,?,?,?)`,
        [id, 'adjustment', stock, stock, d(-40), 'Sample opening stock', nowIso()]
      )
      run('UPDATE ingredients SET current_stock = ? WHERE id = ?', [stock, id])
    }

    /* ---------- suppliers ---------- */
    const supId = uid('sup_')
    run(insertSql('suppliers', ['id','name','contact_person','phone','email','address','notes','created_at','is_sample']), [
      supId, 'Sunrise Wholesale', 'Amina Yusuf', '+1 555 0142', 'sales@sunrise.example', '12 Market Road', 'Sample supplier', nowIso(), 1,
    ])

    /* ---------- recipes ---------- */
    const cakeId = uid('rec_')
    const cookiesId = uid('rec_')
    const cupcakeId = uid('rec_')
    const recipes: [string, string, string, number, string, number, number, number][] = [
      [cakeId, 'Vanilla Celebration Cake', 'Cakes', 10, 'slice', 35, 30, 8],
      [cookiesId, 'Chocolate Chip Cookies', 'Cookies', 24, 'pcs', 15, 12, 10],
      [cupcakeId, 'Butter Cupcakes', 'Cupcakes', 12, 'pcs', 20, 18, 15],
    ]
    for (const [id, name, cat, yq, yu, prep, bake, cool] of recipes) {
      run(insertSql('recipes', ['id','name','category','description','yield_qty','yield_unit','prep_minutes','bake_minutes','cool_minutes','instructions','notes','image_path','packaging_cost','labor_minutes','overhead_override','archived_at','created_at','is_sample']), [
        id, name, cat, 'Sample recipe', yq, yu, prep, bake, cool,
        'Mix dry ingredients. Cream butter and sugar. Combine, then bake until golden. Cool completely before decorating.',
        '', '', cat === 'Cakes' ? 1.2 : 0.3, prep + bake + cool, null, null, nowIso(), 1,
      ])
    }

    // Recipe lines are expressed in each ingredient's purchase unit so the
    // seeded ledger (kg / L / pcs) stays consistent with stock levels.
    const rLines: [string, string, number, string][] = [
      [cakeId, 'Plain Flour', 0.35, 'kg'],
      [cakeId, 'Granulated Sugar', 0.3, 'kg'],
      [cakeId, 'Unsalted Butter', 0.25, 'kg'],
      [cakeId, 'Eggs', 5, 'pcs'],
      [cakeId, 'Whole Milk', 0.12, 'L'],
      [cakeId, 'Vanilla Extract', 0.01, 'L'],
      [cakeId, 'Baking Powder', 0.012, 'kg'],
      [cakeId, 'Salt', 0.004, 'kg'],
      [cookiesId, 'Plain Flour', 0.4, 'kg'],
      [cookiesId, 'Granulated Sugar', 0.2, 'kg'],
      [cookiesId, 'Unsalted Butter', 0.225, 'kg'],
      [cookiesId, 'Dark Chocolate', 0.25, 'kg'],
      [cookiesId, 'Eggs', 2, 'pcs'],
      [cookiesId, 'Salt', 0.003, 'kg'],
      [cupcakeId, 'Plain Flour', 0.3, 'kg'],
      [cupcakeId, 'Granulated Sugar', 0.28, 'kg'],
      [cupcakeId, 'Unsalted Butter', 0.18, 'kg'],
      [cupcakeId, 'Eggs', 4, 'pcs'],
      [cupcakeId, 'Whole Milk', 0.1, 'L'],
      [cupcakeId, 'Baking Powder', 0.01, 'kg'],
    ]
    rLines.forEach(([recipeId, ingName, qty, unit], idx) => {
      const ingRow = queryOne<{ purchase_unit: string; avg_cost: number }>(
        'SELECT purchase_unit, avg_cost FROM ingredients WHERE id = ?',
        [ingIds[ingName]]
      )
      run(
        `INSERT INTO recipe_ingredients (recipe_id, ingredient_id, ingredient_name, quantity, unit, unit_cost, sort_order)
         VALUES (?,?,?,?,?,?,?)`,
        [recipeId, ingIds[ingName], ingName, qty, unit, ingRow?.avg_cost ?? 0, idx]
      )
    })

    /* ---------- products ---------- */
    const products: [string, string, number, number | null, string | null][] = [
      ['Celebration Cake (10 slice)', 'Cakes', 65, 1, cakeId],
      ['Chocolate Chip Cookies (dozen)', 'Cookies', 18, 3, cookiesId],
      ['Butter Cupcakes (box of 12)', 'Cupcakes', 24, 2, cupcakeId],
      ['Brownie Tray (9 pieces)', 'Brownies', 30, null, null],
    ]
    const prodIds: Record<string, string> = {}
    const catRow = (n: string) => queryOne<{ id: number }>('SELECT id FROM product_categories WHERE name = ?', [n])
    for (const [name, cat, price, , recipe] of products) {
      const id = uid('prd_')
      prodIds[name] = id
      run(insertSql('products', ['id','name','category_id','category_name','description','selling_price','recipe_id','unit_of_sale','availability','lead_time_days','notes','image_path','created_at','is_sample']), [
        id, name, catRow(cat)?.id ?? null, cat, 'Sample product', price, recipe, 'each', 'active', 2, '', '', nowIso(), 1,
      ])
    }

    /* ---------- customers ---------- */
    const customers = ['Layla Ahmed', 'Noor Bakery Cafe', 'Omar Farouk', 'Sara Malik', 'Hana Ito']
    const custIds: string[] = []
    for (const name of customers) {
      const id = uid('cus_')
      custIds.push(id)
      run(insertSql('customers', ['id','name','phone','email','address','notes','created_at','archived_at','is_sample']), [
        id, name, `+1 555 0${custIds.length}11`, '', '', 'Sample customer', nowIso(), null, 1,
      ])
    }

    /* ---------- orders + payments ---------- */
    const orderSpecs: [string, number, string, string, number, number, string[]][] = [
      [custIds[0], -12, 'Completed', 'delivery', 20, 0, ['Celebration Cake (10 slice)']],
      [custIds[1], -9, 'Completed', 'pickup', 40, 0, ['Chocolate Chip Cookies (dozen)', 'Butter Cupcakes (box of 12)']],
      [custIds[2], -6, 'Completed', 'pickup', 0, 0, ['Butter Cupcakes (box of 12)']],
      [custIds[3], -3, 'Completed', 'delivery', 25, 0, ['Celebration Cake (10 slice)']],
      [custIds[4], -1, 'Confirmed', 'pickup', 30, 0, ['Chocolate Chip Cookies (dozen)']],
      [custIds[0], 2, 'Confirmed', 'delivery', 50, 0, ['Celebration Cake (10 slice)', 'Butter Cupcakes (box of 12)']],
      [custIds[1], 4, 'Quoted', 'pickup', 0, 0, ['Brownie Tray (9 pieces)']],
      [custIds[2], 6, 'Inquiry', 'pickup', 0, 0, ['Chocolate Chip Cookies (dozen)', 'Brownie Tray (9 pieces)']],
    ]

    let seq = 0
    for (const [custId, offset, status, orderType, deposit, , names] of orderSpecs) {
      seq++
      const id = uid('ord_')
      const created = d(offset - 2)
      const due = d(offset)
      const items = names.map((n) => {
        const price = n.startsWith('Celebration') ? 65 : n.startsWith('Chocolate Chip') ? 18 : n.startsWith('Butter') ? 24 : 30
        const qty = n.startsWith('Celebration') ? 1 : n.startsWith('Brownie') ? 1 : 2
        return {
          product_id: prodIds[n],
          product_name: n,
          recipe_id:
            n.startsWith('Celebration') ? cakeId : n.startsWith('Chocolate Chip') ? cookiesId : n.startsWith('Butter') ? cupcakeId : null,
          unit_price: price,
          quantity: qty,
          customization: '',
        }
      })
      const subtotal = round2(items.reduce((s, i) => s + i.unit_price * i.quantity, 0))
      const totals = computeOrderTotals({ subtotal, discount: 0, tax_rate: 0, delivery_fee: orderType === 'delivery' ? 8 : 0 })
      const custName = queryOne<{ name: string }>('SELECT name FROM customers WHERE id = ?', [custId])?.name ?? ''
      const orderNo = `ORD-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`

      run(
        `INSERT INTO orders (id,order_no,customer_id,customer_name,created_at,due_date,due_time,order_type,status,payment_status,
          subtotal,discount,tax_rate,tax_amount,delivery_fee,total,amount_paid,outstanding,special_instructions,customer_notes,
          internal_notes,cancelled_at,archived_at,is_sample)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,1)`,
        [id, orderNo, custId, custName, created + 'T09:00:00.000Z', due, '16:00', orderType, status, 'Unpaid',
         totals.subtotal, 0, 0, 0, totals.delivery_fee, totals.total, 0, totals.total, '', '', '', null]
      )
      for (const it of items) {
        run(
          `INSERT INTO order_items (order_id, product_id, product_name, recipe_id, unit_price, quantity, customization, line_total)
           VALUES (?,?,?,?,?,?,?,?)`,
          [id, it.product_id, it.product_name, it.recipe_id, it.unit_price, it.quantity, '', round2(it.unit_price * it.quantity)]
        )
      }
      if (deposit > 0) {
        run(
          `INSERT INTO order_payments (id, order_id, amount, type, method, paid_at, notes, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          [uid('pay_'), id, deposit, 'deposit', 'Cash', created, 'Sample deposit', nowIso()]
        )
      } else if (status === 'Completed') {
        run(
          `INSERT INTO order_payments (id, order_id, amount, type, method, paid_at, notes, created_at) VALUES (?,?,?,?,?,?,?,?)`,
          [uid('pay_'), id, totals.total, 'payment', 'Bank Transfer', due, 'Sample payment in full', nowIso()]
        )
      }
      const paidRow = queryOne<{ net: number }>(
        `SELECT COALESCE(SUM(CASE WHEN type IN ('deposit','payment') THEN amount ELSE -amount END),0) AS net
         FROM order_payments WHERE order_id = ?`,
        [id]
      )
      const paid = round2(paidRow?.net ?? 0)
      run('UPDATE orders SET amount_paid=?, outstanding=?, payment_status=? WHERE id=?', [
        paid,
        round2(totals.total - paid),
        paymentStatusFor(totals.total, paid),
        id,
      ])

      /* ---------- production for completed orders ---------- */
      if (status === 'Completed') {
        for (const it of items) {
          if (!it.recipe_id) continue
          const batchId = uid('bat_')
          const batchNo = `BAT-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
          run(
            `INSERT INTO production_batches
              (id,batch_no,production_date,order_id,product_id,product_name,recipe_id,recipe_name,planned_qty,actual_qty,
               status,priority,start_time,end_time,labor_minutes,waste_qty,instructions,notes,consumption_committed,
               recipe_snapshot,created_at,is_sample)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'08:00','12:00',120,0,'','',1,'',?,1)`,
            [batchId, batchNo, addDays(due, -1), id, it.product_id, it.product_name, it.recipe_id,
             queryOne<{ name: string }>('SELECT name FROM recipes WHERE id = ?', [it.recipe_id])?.name ?? '',
             it.quantity, it.quantity, 'Completed', 'Normal', nowIso()]
          )
          const lines = query<{ ingredient_id: string; ingredient_name: string; unit: string; quantity: number; unit_cost: number }>(
            'SELECT ingredient_id, ingredient_name, unit, quantity, unit_cost FROM recipe_ingredients WHERE recipe_id = ?',
            [it.recipe_id]
          )
          const recipe = queryOne<{ yield_qty: number }>('SELECT yield_qty FROM recipes WHERE id = ?', [it.recipe_id])
          const scale = it.quantity / (recipe?.yield_qty || 1)
          for (const l of lines) {
            const q = round2(l.quantity * scale)
            run(
              `INSERT INTO production_consumption (batch_id, ingredient_id, ingredient_name, unit, quantity, unit_cost, total_cost, created_at)
               VALUES (?,?,?,?,?,?,?,?)`,
              [batchId, l.ingredient_id, l.ingredient_name, l.unit, q, l.unit_cost, round2(q * l.unit_cost), nowIso()]
            )
            run(
              `INSERT INTO inventory_movements (ingredient_id, movement_type, quantity, stock_after, movement_date, related_batch_id, reason, created_at)
               VALUES (?,?,?,?,?,?,?,?)`,
              [l.ingredient_id, 'production_consumption', -q, 0, addDays(due, -1), batchId, `Production ${batchNo} — ${l.ingredient_name}`, nowIso()]
            )
          }
        }
      }
    }

    /* ---------- expenses ---------- */
    const expenses: [string, number, string][] = [
      ['Ingredients', 145.5, 'Weekly flour & dairy order'],
      ['Packaging', 42, 'Cake boxes and ribbon'],
      ['Utilities', 68.25, 'Electricity'],
      ['Delivery', 22, 'Courier for weekend orders'],
      ['Marketing', 30, 'Social media boost'],
    ]
    expenses.forEach(([cat, amount, desc], i) => {
      run(insertSql('expenses', ['id','expense_date','category','amount','payment_method','description','notes','related_purchase_id','created_at','is_sample']), [
        uid('exp_'), d(-7 * i - 1), cat, amount, 'Cash', desc, 'Sample expense', null, nowIso(), 1,
      ])
    })

    /* ---------- purchase ---------- */
    const purId = uid('pur_')
    run(insertSql('purchases', ['id','supplier_id','supplier_name','purchase_date','total','payment_status','received','received_at','notes','created_at','is_sample']), [
      purId, supId, 'Sunrise Wholesale', d(-14), 186.4, 'Paid', 1, nowIso(), 'Sample purchase', nowIso(), 1,
    ])

    /* ---------- tasks ---------- */
    const tasks: [string, number, string][] = [
      ['Confirm Saturday cake designs', 1, 'High'],
      ['Order more cake boxes', 3, 'Normal'],
      ['Reply to quoted order', 0, 'High'],
      ['Deep clean the mixer', 5, 'Low'],
    ]
    tasks.forEach(([title, offset, priority]) => {
      run(insertSql('tasks', ['id','title','description','due_date','priority','status','related_order_id','notes','created_at','is_sample']), [
        uid('tsk_'), title, '', d(offset), priority, 'To Do', null, 'Sample task', nowIso(), 1,
      ])
    })

    logAudit('sample_data', null, 'seed', 'demo bakery created')

    // Recompute every stock level from the ledger the seed just wrote, so the
    // demo numbers are internally consistent (consumption already posted
    // movements above).
    const rows = query<{ id: string; total: number | null }>(
      'SELECT ingredient_id AS id, SUM(quantity) AS total FROM inventory_movements GROUP BY ingredient_id'
    )
    const map = new Map(rows.map((r) => [r.id, r.total ?? 0]))
    for (const ing of query<{ id: string }>('SELECT id FROM ingredients')) {
      run('UPDATE ingredients SET current_stock = ? WHERE id = ?', [map.get(ing.id) ?? 0, ing.id])
    }
  })

  notifyDataChanged()
  return { created: true }
}
