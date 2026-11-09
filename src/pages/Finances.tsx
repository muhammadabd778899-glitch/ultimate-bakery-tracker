import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, Wallet, TrendingUp, HandCoins, Receipt, FileDown, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Cell } from 'recharts'
import {
  PageHeader, Card, Grid, SearchInput, Badge, STATUS_TONE, EmptyState, Modal, Field, TextInput, SelectInput, TextArea,
  TableWrap, THead, Confirm, ErrorNote,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import {
  listExpenses, createExpense, updateExpense, deleteExpense, listIncome, createIncome, deleteIncome,
  cashSummary, expenseBreakdown, EXPENSE_CATEGORIES, PAYMENT_METHODS,
} from '../repositories/finance'
import { listOrders, getOrderPayments } from '../repositories/orders'
import { defaultRange } from '../repositories/reports'
import { formatDisplayDate, todayKey, addDays } from '../lib/dates'
import { formatMoney, getDateFormat } from '../lib/format'
import { exportCsv } from '../lib/exporters'

const BARS = ['#E35683', '#F59E6B', '#F4C95D', '#58C99A', '#62B4E8', '#A78BFA', '#EF7C6B', '#F1789E', '#3FA372']

export function FinancesPage() {
  const [params, setParams] = useSearchParams()
  const toast = useApp((s) => s.toast)
  const [tab, setTab] = useState<'summary' | 'expenses' | 'income' | 'payments'>('summary')
  const [from, setFrom] = useState(addDays(todayKey(), -90))
  const [to, setTo] = useState(todayKey())
  const [search, setSearch] = useState('')
  const [expOpen, setExpOpen] = useState(false)
  const [expEdit, setExpEdit] = useState<string | null>(null)
  const [incOpen, setIncOpen] = useState(false)
  const [expDelete, setExpDelete] = useState<string | null>(null)
  const [incDelete, setIncDelete] = useState<string | null>(null)

  useEffect(() => {
    if (params.get('new') === 'expense') {
      setTab('expenses')
      setExpEdit(null)
      setExpOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const summary = useLive(() => cashSummary(from, to), [from, to])
  const breakdown = useLive(() => expenseBreakdown(from, to), [from, to])
  const expenses = useLive(() => listExpenses({ from, to, search }), [from, to, search])
  const income = useLive(() => listIncome(from, to), [from, to])
  const payments = useLive(() => {
    const orders = listOrders({ status: 'All', includeArchived: true })
    return orders
      .flatMap((o) => getOrderPayments(o.id).map((p) => ({ ...p, order_no: o.order_no, customer_name: o.customer_name })))
      .filter((p) => p.paid_at >= from && p.paid_at <= to)
      .sort((a, b) => (a.paid_at < b.paid_at ? 1 : -1))
  }, [from, to])

  const outstanding = useLive(
    () =>
      listOrders({ status: 'All' })
        .filter((o) => o.status !== 'Cancelled' && o.outstanding > 0)
        .sort((a, b) => b.outstanding - a.outstanding),
    []
  )

  const doExport = () => {
    if (tab === 'expenses') {
      exportCsv('expenses.csv', ['Date', 'Category', 'Description', 'Method', 'Amount', 'Notes'], expenses.map((e) => [e.expense_date, e.category, e.description, e.payment_method, e.amount, e.notes]))
    } else if (tab === 'income') {
      exportCsv('income.csv', ['Date', 'Type', 'Category', 'Description', 'Method', 'Amount'], income.map((i) => [i.txn_date, i.type, i.category, i.description, i.payment_method, i.amount]))
    } else if (tab === 'payments') {
      exportCsv('payments.csv', ['Date', 'Order', 'Customer', 'Type', 'Method', 'Amount', 'Notes'], payments.map((p) => [p.paid_at, p.order_no, p.customer_name, p.type, p.method, p.amount, p.notes]))
    } else {
      exportCsv('cash-summary.csv', ['Line', 'Amount'], [
        ['Payments received', summary.payments_received],
        ['Refunds', summary.refunds],
        ['Other income', summary.other_income],
        ['Expenses', summary.expenses],
        ['Net cash movement', summary.net_cash],
      ])
    }
    toast('success', 'Exported')
  }

  return (
    <>
      <PageHeader
        title="Finances"
        subtitle="Money in, money out, and what customers still owe you"
        actions={
          <>
            <button className="btn-secondary" onClick={doExport}>
              <FileDown size={15} /> CSV
            </button>
            <button className="btn-secondary" onClick={() => { setExpEdit(null); setExpOpen(true) }}>
              <Receipt size={15} /> Record expense
            </button>
            <button className="btn-primary" onClick={() => setIncOpen(true)}>
              <Plus size={15} /> Other income
            </button>
          </>
        }
      />

      <Card className="p-4 mb-5 no-print">
        <div className="flex flex-wrap gap-2.5 items-end">
          <div>
            <label className="label !mb-1">From</label>
            <TextInput type="date" className="!w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label !mb-1">To</label>
            <TextInput type="date" className="!w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex gap-1.5 ml-auto">
            {[
              ['7 days', 7],
              ['30 days', 30],
              ['90 days', 90],
            ].map(([label, days]) => (
              <button key={label as string} className="btn-ghost !h-9 !text-[12.5px]" onClick={() => { setFrom(addDays(todayKey(), -(days as number))); setTo(todayKey()) }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex gap-1.5 mb-5 no-print overflow-x-auto">
        {(['summary', 'expenses', 'income', 'payments'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 px-4 rounded-xl text-[13px] font-medium capitalize transition shrink-0 ${
              tab === t ? 'bg-pink-400 text-white' : 'bg-white border border-line text-muted hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'summary' && (
        <>
          <Grid cols={4} className="mb-5">
            <MoneyCard label="Payments received" value={summary.payments_received} tone="text-ok" icon={<ArrowUpRight size={18} />} />
            <MoneyCard label="Refunds" value={summary.refunds} tone="text-bad" icon={<ArrowDownRight size={18} />} />
            <MoneyCard label="Expenses" value={summary.expenses} tone="text-bad" icon={<Receipt size={18} />} />
            <MoneyCard label="Net cash movement" value={summary.net_cash} tone={summary.net_cash >= 0 ? 'text-ok' : 'text-bad'} icon={<Wallet size={18} />} />
          </Grid>

          <div className="grid lg:grid-cols-3 gap-5">
            <Card title="Expense breakdown" className="lg:col-span-2 p-5">
              {breakdown.length === 0 ? (
                <EmptyState title="No expenses in this period" description="Record what you spend to see where the money goes." icon={<Receipt size={26} />} />
              ) : (
                <div className="h-[260px] -ml-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={breakdown} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke="#F5E6DC" vertical={false} />
                      <XAxis dataKey="category" tick={{ fontSize: 10.5, fill: '#8A6F7B' }} tickLine={false} axisLine={false} interval={0} angle={-14} textAnchor="end" height={56} />
                      <YAxis tick={{ fontSize: 11, fill: '#8A6F7B' }} tickLine={false} axisLine={false} width={54} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                      <RTooltip contentStyle={{ borderRadius: 12, border: '1px solid #F5E6DC', fontSize: 12 }} formatter={(v: number) => [formatMoney(v), 'Spent']} />
                      <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                        {breakdown.map((_, i) => (
                          <Cell key={i} fill={BARS[i % BARS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card title="Customers who owe you" className="p-0">
              {outstanding.length === 0 ? (
                <EmptyState title="All settled" description="No outstanding balances right now." icon={<HandCoins size={24} />} />
              ) : (
                <div className="divide-y divide-line max-h-[300px] overflow-y-auto">
                  {outstanding.slice(0, 12).map((o) => (
                    <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-pink-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{o.order_no}</p>
                        <p className="text-[11.5px] text-muted truncate">{o.customer_name || 'Walk-in'}</p>
                      </div>
                      <span className="tnum font-medium text-warn">{formatMoney(o.outstanding)}</span>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="p-4 mt-5 text-[12.5px] text-muted leading-relaxed">
            <b className="text-ink">How these numbers are defined.</b> “Payments received” is actual money recorded against
            orders (deposits and payments minus refunds). “Expenses” are the expense records you entered. Neither is a formal
            accounting statement — this is a practical business tracker, not bookkeeping software.
          </Card>
        </>
      )}

      {tab === 'expenses' && (
        <>
          <Card className="p-4 mb-5 no-print">
            <div className="flex flex-wrap gap-2.5 items-center">
              <SearchInput value={search} onChange={setSearch} placeholder="Search expenses…" className="w-full sm:w-64" />
              <span className="text-[13px] text-muted ml-auto">
                Total <b className="text-ink tnum">{formatMoney(expenses.reduce((s, e) => s + e.amount, 0))}</b>
              </span>
              <button className="btn-primary !h-9" onClick={() => { setExpEdit(null); setExpOpen(true) }}>
                <Plus size={15} /> Add expense
              </button>
            </div>
          </Card>

          <Card className="p-0">
            {expenses.length === 0 ? (
              <EmptyState title="No expenses in this period" description="Track ingredients, packaging, utilities, rent, delivery and more." icon={<Receipt size={26} />} action={<button className="btn-primary" onClick={() => { setExpEdit(null); setExpOpen(true) }}><Plus size={15} /> Add expense</button>} />
            ) : (
              <TableWrap>
                <THead cols={['Date', 'Category', 'Description', 'Method', 'Amount', '']} />
                <tbody className="divide-y divide-line">
                  {expenses.map((e) => (
                    <tr key={e.id} className="hover:bg-pale">
                      <td className="td tnum text-[12.5px]">{formatDisplayDate(e.expense_date, getDateFormat())}</td>
                      <td className="td"><Badge tone="neutral">{e.category}</Badge></td>
                      <td className="td">
                        <span className="block">{e.description || '—'}</span>
                        {e.notes && <span className="text-[11.5px] text-muted">{e.notes}</span>}
                      </td>
                      <td className="td text-muted text-[12.5px]">{e.payment_method}</td>
                      <td className="td tnum font-medium text-bad">{formatMoney(e.amount)}</td>
                      <td className="td text-right whitespace-nowrap no-print">
                        <button className="btn-ghost !h-8 !px-2" onClick={() => { setExpEdit(e.id); setExpOpen(true) }}><Pencil size={15} /></button>
                        <button className="btn-ghost !h-8 !px-2" onClick={() => setExpDelete(e.id)}><Trash2 size={15} className="text-bad" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </>
      )}

      {tab === 'income' && (
        <Card className="p-0">
          {income.length === 0 ? (
            <EmptyState
              title="No other income"
              description="Money that is not tied to a customer order (classes, stall sales, equipment sales) goes here. Order payments are tracked on the order itself, so nothing is ever counted twice."
              icon={<TrendingUp size={26} />}
              action={<button className="btn-primary" onClick={() => setIncOpen(true)}><Plus size={15} /> Add income</button>}
            />
          ) : (
            <TableWrap>
              <THead cols={['Date', 'Category', 'Description', 'Method', 'Amount', '']} />
              <tbody className="divide-y divide-line">
                {income.map((i) => (
                  <tr key={i.id} className="hover:bg-pale">
                    <td className="td tnum text-[12.5px]">{formatDisplayDate(i.txn_date, getDateFormat())}</td>
                    <td className="td"><Badge tone="success">{i.category}</Badge></td>
                    <td className="td">{i.description || '—'}</td>
                    <td className="td text-muted text-[12.5px]">{i.payment_method}</td>
                    <td className="td tnum font-medium text-ok">{formatMoney(i.amount)}</td>
                    <td className="td text-right no-print">
                      <button className="btn-ghost !h-8 !px-2" onClick={() => setIncDelete(i.id)}><Trash2 size={15} className="text-bad" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      {tab === 'payments' && (
        <Card className="p-0">
          {payments.length === 0 ? (
            <EmptyState title="No payments in this period" description="Deposits, payments and refunds recorded on orders appear here." icon={<HandCoins size={26} />} />
          ) : (
            <TableWrap>
              <THead cols={['Date', 'Order', 'Customer', 'Type', 'Method', 'Amount']} />
              <tbody className="divide-y divide-line">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-pale">
                    <td className="td tnum text-[12.5px]">{formatDisplayDate(p.paid_at, getDateFormat())}</td>
                    <td className="td">
                      <Link to={`/orders/${p.order_id}`} className="text-pink-600 hover:underline font-medium">{p.order_no}</Link>
                    </td>
                    <td className="td text-[12.5px]">{p.customer_name}</td>
                    <td className="td"><Badge tone={p.type === 'refund' ? 'danger' : p.type === 'deposit' ? 'warning' : 'success'}>{p.type}</Badge></td>
                    <td className="td text-muted text-[12.5px]">{p.method}</td>
                    <td className={`td tnum font-medium ${p.type === 'refund' ? 'text-bad' : 'text-ok'}`}>
                      {p.type === 'refund' ? '−' : ''}{formatMoney(p.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      )}

      <ExpenseModal
        open={expOpen}
        expenseId={expEdit}
        from={from}
        onClose={() => setExpOpen(false)}
        onSaved={() => { setExpOpen(false); toast('success', expEdit ? 'Expense updated' : 'Expense recorded') }}
      />
      <IncomeModal open={incOpen} onClose={() => setIncOpen(false)} onSaved={() => { setIncOpen(false); toast('success', 'Income recorded') }} />

      <Confirm
        open={!!expDelete}
        title="Delete this expense?"
        message="It will no longer appear in expense totals or reports."
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          if (expDelete) deleteExpense(expDelete)
          toast('success', 'Expense deleted')
          setExpDelete(null)
        }}
        onCancel={() => setExpDelete(null)}
      />
      <Confirm
        open={!!incDelete}
        title="Delete this income record?"
        message="It will no longer appear in income totals."
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          if (incDelete) deleteIncome(incDelete)
          toast('success', 'Income deleted')
          setIncDelete(null)
        }}
        onCancel={() => setIncDelete(null)}
      />
    </>
  )
}

function MoneyCard({ label, value, tone, icon }: { label: string; value: number; tone: string; icon: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">{label}</p>
        <span className={`${tone} opacity-70`}>{icon}</span>
      </div>
      <p className={`mt-1.5 text-[23px] font-semibold tnum ${tone}`}>{formatMoney(value)}</p>
    </Card>
  )
}

/* ================================ Modals ================================ */

function ExpenseModal({ open, expenseId, from, onClose, onSaved }: { open: boolean; expenseId: string | null; from: string; onClose: () => void; onSaved: () => void }) {
  const existing = useLive(() => (open && expenseId ? listExpenses().find((e) => e.id === expenseId) : undefined), [open, expenseId])
  const [form, setForm] = useState({ expense_date: todayKey(), category: 'Ingredients', amount: 0, payment_method: 'Cash', description: '', notes: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setForm(
      existing
        ? { expense_date: existing.expense_date, category: existing.category, amount: existing.amount, payment_method: existing.payment_method, description: existing.description, notes: existing.notes }
        : { expense_date: from || todayKey(), category: 'Ingredients', amount: 0, payment_method: 'Cash', description: '', notes: '' }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, expenseId])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    try {
      if (expenseId) updateExpense(expenseId, form as never)
      else createExpense(form as never)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={expenseId ? 'Edit expense' : 'Record expense'}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>{expenseId ? 'Save changes' : 'Record expense'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Date" required>
            <TextInput type="date" value={form.expense_date} onChange={(e) => set('expense_date', e.target.value)} />
          </Field>
          <Field label="Amount" required>
            <TextInput type="number" min={0} step="0.01" className="tnum" value={form.amount || ''} onChange={(e) => set('amount', Number(e.target.value))} />
          </Field>
          <Field label="Category">
            <SelectInput value={form.category} onChange={(e) => set('category', e.target.value)}>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Paid with">
            <SelectInput value={form.payment_method} onChange={(e) => set('payment_method', e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </SelectInput>
          </Field>
        </div>
        <Field label="Description">
          <TextInput value={form.description} onChange={(e) => set('description', e.target.value)} placeholder="e.g. Weekly flour order" />
        </Field>
        <Field label="Notes"><TextArea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

function IncomeModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ txn_date: todayKey(), category: 'Other', amount: 0, payment_method: 'Cash', description: '', notes: '' })
  const [error, setError] = useState('')

  const submit = () => {
    try {
      createIncome({ ...form, type: 'other_income' })
      onSaved()
      setForm({ txn_date: todayKey(), category: 'Other', amount: 0, payment_method: 'Cash', description: '', notes: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Other income"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Record</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" required>
            <TextInput type="date" value={form.txn_date} onChange={(e) => setForm((f) => ({ ...f, txn_date: e.target.value }))} />
          </Field>
          <Field label="Amount" required>
            <TextInput type="number" min={0} step="0.01" className="tnum" value={form.amount || ''} onChange={(e) => setForm((f) => ({ ...f, amount: Number(e.target.value) }))} />
          </Field>
        </div>
        <Field label="Category">
          <SelectInput value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {['Class fee', 'Stall sales', 'Equipment sale', 'Other'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Description">
          <TextInput value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <p className="hint">Use this only for income that is not a customer order payment — orders track their own payments.</p>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
