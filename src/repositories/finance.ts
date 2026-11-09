import { query, queryOne, run, transaction, nowIso, logAudit, insertSql } from '../db/database'
import { uid } from '../lib/id'
import { round2 } from '../lib/money'
import { todayKey } from '../lib/dates'
import { notifyDataChanged } from '../store/app'
import type { Expense, IncomeTxn } from '../types'

export const EXPENSE_CATEGORIES = [
  'Ingredients', 'Packaging', 'Equipment', 'Utilities', 'Rent', 'Marketing', 'Delivery', 'Labor', 'Other',
]

export const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'Card', 'Mobile Money', 'Cheque', 'Other']

/* The order of dates: report periods are inclusive on both ends (from <= d <= to). */

export function listExpenses(opts: { from?: string; to?: string; category?: string; search?: string } = {}): Expense[] {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.from) {
    where.push('date(expense_date) >= date(?)')
    params.push(opts.from)
  }
  if (opts.to) {
    where.push('date(expense_date) <= date(?)')
    params.push(opts.to)
  }
  if (opts.category && opts.category !== 'All') {
    where.push('category = ?')
    params.push(opts.category)
  }
  if (opts.search?.trim()) {
    where.push('(description LIKE ? OR notes LIKE ?)')
    params.push(`%${opts.search.trim()}%`, `%${opts.search.trim()}%`)
  }
  return query(
    `SELECT * FROM expenses ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date(expense_date) DESC, created_at DESC`,
    params
  )
}

export function createExpense(input: Omit<Expense, 'id' | 'created_at' | 'is_sample'>): Expense {
  if (!(Number(input.amount) > 0)) throw new Error('Expense amount must be greater than zero.')
  if (!input.expense_date) throw new Error('Expense date is required.')
  const id = uid('exp_')
  const cols = ['id', 'expense_date', 'category', 'amount', 'payment_method', 'description', 'notes', 'related_purchase_id', 'created_at', 'is_sample']
  run(insertSql('expenses', cols), [
    id,
    input.expense_date,
    input.category || 'Other',
    round2(input.amount),
    input.payment_method || 'Cash',
    input.description ?? '',
    input.notes ?? '',
    input.related_purchase_id ?? null,
    nowIso(),
    0,
  ])
  logAudit('expense', id, 'create', `${input.category} ${input.amount}`)
  notifyDataChanged()
  return queryOne<Expense>('SELECT * FROM expenses WHERE id = ?', [id])!
}

export function updateExpense(id: string, input: Omit<Expense, 'id' | 'created_at' | 'is_sample'>) {
  if (!(Number(input.amount) > 0)) throw new Error('Expense amount must be greater than zero.')
  run(
    `UPDATE expenses SET expense_date=?, category=?, amount=?, payment_method=?, description=?, notes=? WHERE id=?`,
    [input.expense_date, input.category || 'Other', round2(input.amount), input.payment_method || 'Cash', input.description ?? '', input.notes ?? '', id]
  )
  logAudit('expense', id, 'update')
  notifyDataChanged()
}

export function deleteExpense(id: string) {
  run('DELETE FROM expenses WHERE id = ?', [id])
  logAudit('expense', id, 'delete')
  notifyDataChanged()
}

/* ====================== Non-order income ======================
 * Order payments live in order_payments (single source of truth for what a
 * customer paid). This table only holds income that is NOT tied to an order,
 * which guarantees no cash figure is ever counted twice. */

export function listIncome(from?: string, to?: string): IncomeTxn[] {
  const where: string[] = []
  const params: unknown[] = []
  if (from) {
    where.push('date(txn_date) >= date(?)')
    params.push(from)
  }
  if (to) {
    where.push('date(txn_date) <= date(?)')
    params.push(to)
  }
  return query(
    `SELECT * FROM income_transactions ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date(txn_date) DESC`,
    params
  )
}

export function createIncome(input: Omit<IncomeTxn, 'id' | 'created_at' | 'is_sample'>): IncomeTxn {
  if (!(Number(input.amount) > 0)) throw new Error('Amount must be greater than zero.')
  const id = uid('inc_')
  const cols = ['id', 'txn_date', 'type', 'category', 'amount', 'payment_method', 'description', 'notes', 'created_at', 'is_sample']
  run(insertSql('income_transactions', cols), [
    id,
    input.txn_date || todayKey(),
    input.type || 'other_income',
    input.category || 'Other',
    round2(input.amount),
    input.payment_method || 'Cash',
    input.description ?? '',
    input.notes ?? '',
    nowIso(),
    0,
  ])
  logAudit('income', id, 'create', `${input.amount}`)
  notifyDataChanged()
  return queryOne<IncomeTxn>('SELECT * FROM income_transactions WHERE id = ?', [id])!
}

export function deleteIncome(id: string) {
  run('DELETE FROM income_transactions WHERE id = ?', [id])
  logAudit('income', id, 'delete')
  notifyDataChanged()
}

/* ====================== Aggregates ====================== */

export interface CashSummary {
  payments_received: number
  refunds: number
  other_income: number
  expenses: number
  net_cash: number
}

export function cashSummary(from?: string, to?: string): CashSummary {
  const range = (col: string) => {
    const clauses: string[] = []
    const params: unknown[] = []
    if (from) {
      clauses.push(`date(${col}) >= date(?)`)
      params.push(from)
    }
    if (to) {
      clauses.push(`date(${col}) <= date(?)`)
      params.push(to)
    }
    return { where: clauses.length ? ' AND ' + clauses.join(' AND ') : '', params }
  }

  const p = range('paid_at')
  const payments = queryOne<{ money_in: number | null; money_out: number | null }>(
    `SELECT
       SUM(CASE WHEN type IN ('deposit','payment') THEN amount ELSE 0 END) AS money_in,
       SUM(CASE WHEN type = 'refund' THEN amount ELSE 0 END) AS money_out
     FROM order_payments WHERE 1=1${p.where}`,
    p.params
  )

  const e = range('expense_date')
  const exp = queryOne<{ total: number | null }>(`SELECT SUM(amount) AS total FROM expenses WHERE 1=1${e.where}`, e.params)

  const i = range('txn_date')
  const inc = queryOne<{ total: number | null }>(
    `SELECT SUM(amount) AS total FROM income_transactions WHERE 1=1${i.where}`,
    i.params
  )

  const payments_received = round2(payments?.money_in ?? 0)
  const refunds = round2(payments?.money_out ?? 0)
  const other_income = round2(inc?.total ?? 0)
  const expenses = round2(exp?.total ?? 0)
  return {
    payments_received,
    refunds,
    other_income,
    expenses,
    net_cash: round2(payments_received + other_income - refunds - expenses),
  }
}

export interface ExpenseBreakdown {
  category: string
  total: number
  count: number
}

export function expenseBreakdown(from?: string, to?: string): ExpenseBreakdown[] {
  const where: string[] = []
  const params: unknown[] = []
  if (from) {
    where.push('date(expense_date) >= date(?)')
    params.push(from)
  }
  if (to) {
    where.push('date(expense_date) <= date(?)')
    params.push(to)
  }
  return query(
    `SELECT category, ROUND(SUM(amount),2) AS total, COUNT(*) AS count FROM expenses
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     GROUP BY category ORDER BY total DESC`,
    params
  )
}

export function totalExpensesEver(): number {
  return round2(queryOne<{ t: number | null }>('SELECT SUM(amount) AS t FROM expenses')?.t ?? 0)
}
