import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import { FileDown, Printer, BarChart3, Package, Factory, Users, Wallet, ClipboardList } from 'lucide-react'
import {
  PageHeader, Card, Grid, Badge, EmptyState, TableWrap, THead, SelectInput, TextInput, STATUS_TONE,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import {
  salesByPeriod, salesByProduct, salesByCategory, salesByCustomer,
  orderStats, profitabilityReport, expenseReport,
  inventoryReport, consumptionReport, wasteReport, productionReport, customerInsights,
  defaultRange, monthRange, yearRange,
} from '../repositories/reports'
import { formatDisplayDate, todayKey, addDays } from '../lib/dates'
import { formatMoney, getDateFormat } from '../lib/format'
import { exportCsv, exportPdf, printHtml } from '../lib/exporters'

const BARS = ['#E35683', '#F59E6B', '#F4C95D', '#58C99A', '#62B4E8', '#A78BFA', '#EF7C6B', '#F1789E', '#3FA372']

type Tab = 'sales' | 'orders' | 'profit' | 'inventory' | 'production' | 'customers'

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'sales', label: 'Sales', icon: <BarChart3 size={14} /> },
  { id: 'orders', label: 'Orders', icon: <ClipboardList size={14} /> },
  { id: 'profit', label: 'Profitability', icon: <Wallet size={14} /> },
  { id: 'inventory', label: 'Inventory', icon: <Package size={14} /> },
  { id: 'production', label: 'Production', icon: <Factory size={14} /> },
  { id: 'customers', label: 'Customers', icon: <Users size={14} /> },
]

export function ReportsPage() {
  const toast = useApp((s) => s.toast)
  const [tab, setTab] = useState<Tab>('sales')
  const [from, setFrom] = useState(defaultRange(30).from)
  const [to, setTo] = useState(defaultRange(30).to)
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day')

  const rangeLabel = `${formatDisplayDate(from, getDateFormat())} → ${formatDisplayDate(to, getDateFormat())}`

  const byPeriod = useLive(() => salesByPeriod(from, to, period), [from, to, period])
  const byProduct = useLive(() => salesByProduct(from, to), [from, to])
  const byCategory = useLive(() => salesByCategory(from, to), [from, to])
  const byCustomer = useLive(() => salesByCustomer(from, to), [from, to])

  const oStats = useLive(() => orderStats(from, to), [from, to])
  const profit = useLive(() => profitabilityReport(from, to), [from, to])
  const expenses = useLive(() => expenseReport(from, to), [from, to])

  const inv = useLive(() => inventoryReport(), [])
  const consumption = useLive(() => consumptionReport(from, to), [from, to])
  const waste = useLive(() => wasteReport(from, to), [from, to])

  const prod = useLive(() => productionReport(from, to), [from, to])
  const cust = useLive(() => customerInsights(from, to), [from, to])

  const presets: [string, () => void][] = [
    ['Today', () => { setFrom(todayKey()); setTo(todayKey()) }],
    ['7 days', () => { setFrom(addDays(todayKey(), -7)); setTo(todayKey()) }],
    ['This month', () => { const r = monthRange(); setFrom(r.from); setTo(r.to) }],
    ['30 days', () => { const r = defaultRange(30); setFrom(r.from); setTo(r.to) }],
    ['This year', () => { const r = yearRange(); setFrom(r.from); setTo(r.to) }],
  ]

  /* ------------------------------- exporters ------------------------------ */

  const doCsv = () => {
    const name = `${tab}-report-${from}-to-${to}`
    if (tab === 'sales') {
      exportCsv(`${name}.csv`, ['Period', 'Revenue', 'Orders', 'Avg order'], byPeriod.map((r) => [r.period, r.revenue, r.orders, r.avg_order]))
    } else if (tab === 'orders') {
      exportCsv(`${name}.csv`, ['Metric', 'Value'], [
        ['Total orders', oStats.total],
        ['Completed', oStats.completed],
        ['Cancelled', oStats.cancelled],
        ['Pending', oStats.pending],
        ['Average order value', oStats.avgOrder],
        ['On-time rate %', oStats.onTimeRate],
      ])
    } else if (tab === 'profit') {
      exportCsv(`${name}.csv`, ['Line', 'Amount'], [
        ['Revenue', profit.revenue],
        ['Ingredient cost (COGS)', profit.cogs],
        ['Expenses', profit.expenses],
        ['Waste value', profit.wasteValue],
        ['Gross profit', profit.grossProfit],
        ['Estimated net', profit.estimatedNet],
      ])
    } else if (tab === 'inventory') {
      exportCsv(`${name}.csv`, ['Ingredient', 'Stock', 'Unit', 'Value', 'Reorder level'], inv.rows.map((r) => [r.name, r.current_stock, r.purchase_unit, r.value, r.min_stock]))
    } else if (tab === 'production') {
      exportCsv(`${name}.csv`, ['Status', 'Batches'], prod.byStatus.map((r) => [r.status, r.count]))
    } else {
      exportCsv(`${name}.csv`, ['Customer', 'Orders', 'Revenue', 'Paid'], cust.repeat.map((r) => [r.customer_name, r.orders, r.revenue, r.outstanding]))
    }
    toast('success', 'CSV exported')
  }

  const doPdf = () => {
    if (tab === 'sales') {
      exportPdf({
        title: 'Sales report',
        subtitle: rangeLabel,
        orientation: 'landscape',
        table: {
          head: ['Period', 'Revenue', 'Orders', 'Avg order'],
          body: byPeriod.map((r) => [r.period, formatMoney(r.revenue), r.orders, formatMoney(r.avg_order)]),
        },
        filename: `sales-report-${from}.pdf`,
      })
    } else if (tab === 'orders') {
      exportPdf({
        title: 'Order report',
        subtitle: rangeLabel,
        table: {
          head: ['Metric', 'Value'],
          body: [
            ['Total orders', oStats.total],
            ['Completed', oStats.completed],
            ['Cancelled', oStats.cancelled],
            ['Pending', oStats.pending],
            ['Average order value', formatMoney(oStats.avgOrder)],
            ['On-time delivery rate', `${oStats.onTimeRate}%`],
          ],
        },
        filename: `order-report-${from}.pdf`,
      })
    } else if (tab === 'profit') {
      exportPdf({
        title: 'Profitability report',
        subtitle: `${rangeLabel}  ·  estimated figures`,
        table: {
          head: ['Line', 'Amount'],
          body: [
            ['Revenue', formatMoney(profit.revenue)],
            ['Ingredient cost (COGS)', formatMoney(profit.cogs)],
            ['Gross profit', formatMoney(profit.grossProfit)],
            ['Gross margin', `${profit.grossMargin}%`],
            ['Expenses', formatMoney(profit.expenses)],
            ['Waste value', formatMoney(profit.wasteValue)],
            ['Estimated net', formatMoney(profit.estimatedNet)],
          ],
        },
        filename: `profit-report-${from}.pdf`,
      })
    } else if (tab === 'inventory') {
      exportPdf({
        title: 'Inventory report',
        subtitle: `Stock valuation ${formatMoney(inv.valuationTotal)}`,
        orientation: 'landscape',
        table: {
          head: ['Ingredient', 'Stock', 'Unit', 'Value', 'Reorder level'],
          body: inv.rows.map((r) => [r.name, r.current_stock, r.purchase_unit, formatMoney(r.value), r.min_stock]),
        },
        filename: 'inventory-report.pdf',
      })
    } else if (tab === 'production') {
      exportPdf({
        title: 'Production report',
        subtitle: rangeLabel,
        table: {
          head: ['Metric', 'Value'],
          body: [
            ['Batches planned (units)', prod.planned],
            ['Batches actual (units)', prod.actual],
            ['Yield rate', `${prod.yieldRate}%`],
            ['Completed batches', prod.completed],
            ['Failed batches', prod.failed],
            ['Wasted units', prod.wasted],
            ['Ingredient cost', formatMoney(prod.ingredientCost)],
          ],
        },
        filename: `production-report-${from}.pdf`,
      })
    } else {
      exportPdf({
        title: 'Customer report',
        subtitle: rangeLabel,
        orientation: 'landscape',
        table: {
          head: ['Customer', 'Orders', 'Revenue', 'Outstanding'],
          body: cust.repeat.map((r) => [r.customer_name, r.orders, formatMoney(r.revenue), formatMoney(r.outstanding)]),
        },
        filename: `customer-report-${from}.pdf`,
      })
    }
    toast('success', 'PDF saved')
  }

  const exportButtons = (
    <>
      <button className="btn-secondary" onClick={doCsv}><FileDown size={15} /> CSV</button>
      <button className="btn-secondary" onClick={doPdf}><FileDown size={15} /> PDF</button>
      <button className="btn-secondary" onClick={printHtml}><Printer size={15} /> Print</button>
    </>
  )

  /* -------------------------------- render -------------------------------- */

  return (
    <>
      <PageHeader title="Reports" subtitle={`Real figures from your records · ${rangeLabel}`} actions={exportButtons} />

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
          {(tab === 'sales') && (
            <div>
              <label className="label !mb-1">Group by</label>
              <SelectInput className="!w-auto" value={period} onChange={(e) => setPeriod(e.target.value as 'day' | 'week' | 'month')}>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </SelectInput>
            </div>
          )}
          <div className="flex gap-1.5 ml-auto flex-wrap">
            {presets.map(([label, fn]) => (
              <button key={label} className="btn-ghost !h-9 !text-[12.5px]" onClick={fn}>{label}</button>
            ))}
          </div>
        </div>
      </Card>

      <div className="flex gap-1.5 mb-5 no-print overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`h-9 px-4 rounded-xl text-[13px] font-medium flex items-center gap-1.5 transition shrink-0 ${
              tab === t.id ? 'bg-pink-400 text-white' : 'bg-white border border-line text-muted hover:text-ink'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {tab === 'sales' && <SalesTab period={period} byPeriod={byPeriod} byProduct={byProduct} byCategory={byCategory} byCustomer={byCustomer} />}
      {tab === 'orders' && <OrdersTab stats={oStats} />}
      {tab === 'profit' && <ProfitTab profit={profit} expenses={expenses} />}
      {tab === 'inventory' && <InventoryTab inv={inv} consumption={consumption} waste={waste} />}
      {tab === 'production' && <ProductionTab prod={prod} />}
      {tab === 'customers' && <CustomersTab cust={cust} />}
    </>
  )
}

/* ================================= Sales ================================= */

function SalesTab({
  period, byPeriod, byProduct, byCategory, byCustomer,
}: {
  period: string
  byPeriod: { period: string; revenue: number; orders: number; avg_order: number }[]
  byProduct: { product_name: string; units: number; revenue: number; orders: number }[]
  byCategory: { category: string; revenue: number; units: number }[]
  byCustomer: { customer_name: string; orders: number; revenue: number; paid: number }[]
}) {
  const totalRevenue = byPeriod.reduce((s, r) => s + r.revenue, 0)
  const totalOrders = byPeriod.reduce((s, r) => s + r.orders, 0)

  if (totalOrders === 0 && byProduct.length === 0) {
    return (
      <EmptyState
        title="No sales in this period"
        description="Pick a wider date range, or create some orders to see revenue broken down by period, product, category and customer."
        icon={<BarChart3 size={26} />}
      />
    )
  }

  return (
    <>
      <Grid cols={3} className="mb-5">
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Revenue</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum text-ok">{formatMoney(totalRevenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Orders</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{totalOrders}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Avg order value</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{formatMoney(totalOrders ? totalRevenue / totalOrders : 0)}</p>
        </Card>
      </Grid>

      <Card title={`Revenue by ${period}`} className="p-5 mb-5">
        <div className="h-[260px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byPeriod} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#F5E6DC" vertical={false} />
              <XAxis dataKey="period" tick={{ fontSize: 10.5, fill: '#8A6F7B' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11, fill: '#8A6F7B' }} tickLine={false} axisLine={false} width={54} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
              <RTooltip contentStyle={{ borderRadius: 12, border: '1px solid #F1E0D6', fontSize: 12, boxShadow: '0 12px 30px -18px rgba(61,38,51,.4)' }} formatter={(v: number) => [formatMoney(v), 'Revenue']} />
              <Bar dataKey="revenue" radius={[8, 8, 2, 2]} fill="#E35683" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <Card title="Top products" className="p-0">
          <TableWrap>
            <THead cols={['Product', 'Units', 'Orders', 'Revenue']} />
            <tbody className="divide-y divide-line">
              {byProduct.slice(0, 10).map((r) => (
                <tr key={r.product_name} className="hover:bg-pale">
                  <td className="td">{r.product_name || '—'}</td>
                  <td className="td tnum">{r.units}</td>
                  <td className="td tnum text-muted">{r.orders}</td>
                  <td className="td tnum font-medium">{formatMoney(r.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        <Card title="By category" className="p-5">
          {byCategory.length === 0 ? (
            <EmptyState title="No category data" icon={<BarChart3 size={24} />} />
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} layout="vertical" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#F5E6DC" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8A6F7B' }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                  <YAxis type="category" dataKey="category" tick={{ fontSize: 11, fill: '#8A6F7B' }} tickLine={false} axisLine={false} width={90} />
                  <RTooltip contentStyle={{ borderRadius: 12, border: '1px solid #F1E0D6', fontSize: 12, boxShadow: '0 12px 30px -18px rgba(61,38,51,.4)' }} formatter={(v: number) => [formatMoney(v), 'Revenue']} />
                  <Bar dataKey="revenue" radius={[0, 6, 6, 0]}>
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={BARS[i % BARS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <Card title="Top customers by revenue" className="p-0">
        <TableWrap>
          <THead cols={['Customer', 'Orders', 'Revenue', 'Paid']} />
          <tbody className="divide-y divide-line">
            {byCustomer.slice(0, 10).map((r) => (
              <tr key={r.customer_name} className="hover:bg-pale">
                <td className="td">{r.customer_name || 'Walk-in'}</td>
                <td className="td tnum">{r.orders}</td>
                <td className="td tnum font-medium">{formatMoney(r.revenue)}</td>
                <td className="td tnum text-ok">{formatMoney(r.paid)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </>
  )
}

/* ================================ Orders ================================= */

function OrdersTab({ stats }: { stats: ReturnType<typeof orderStats> }) {
  if (stats.total === 0) {
    return <EmptyState title="No orders in this period" description="Orders are counted on their delivery or pickup date." icon={<ClipboardList size={26} />} />
  }
  const done = stats.completed
  return (
    <>
      <Grid cols={4} className="mb-5">
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Total orders</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{stats.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Completed</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum text-ok">{stats.completed}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Cancelled</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum text-bad">{stats.cancelled}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Avg order value</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{formatMoney(stats.avgOrder)}</p>
        </Card>
      </Grid>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Order status split" className="p-5">
          <div className="space-y-4">
            {[
              ['Completed', stats.completed, 'bg-ok'],
              ['Pending / in progress', stats.pending, 'bg-pink-400'],
              ['Cancelled', stats.cancelled, 'bg-bad'],
            ].map(([label, value, color]) => (
              <div key={label as string}>
                <div className="flex justify-between text-[13px] mb-1.5">
                  <span className="text-muted">{label}</span>
                  <span className="tnum font-medium">{value as number}</span>
                </div>
                <div className="h-2 rounded-full bg-pink-100 overflow-hidden">
                  <div className={`h-full rounded-full ${color as string}`} style={{ width: `${stats.total ? ((value as number) / stats.total) * 100 : 0}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="On-time delivery" className="p-5">
          <p className="text-[40px] font-semibold tnum text-ok leading-none">{stats.onTimeRate}%</p>
          <p className="text-sm text-muted mt-2">
            {done} completed order{done === 1 ? '' : 's'} in period · measured against {stats.onTimeTotal} with a due date.
          </p>
          <p className="hint mt-4">
            An order counts as on-time when it was completed on or before its promised delivery date.
          </p>
        </Card>
      </div>
    </>
  )
}

/* ============================= Profitability ============================= */

function ProfitTab({
  profit, expenses,
}: {
  profit: ReturnType<typeof profitabilityReport>
  expenses: { category: string; total: number; count: number }[]
}) {
  const rows: [string, number, string][] = [
    ['Revenue', profit.revenue, 'text-ok'],
    ['Ingredient cost (COGS)', -profit.cogs, 'text-bad'],
    ['Gross profit', profit.grossProfit, profit.grossProfit >= 0 ? 'text-ok' : 'text-bad'],
    ['Operating expenses', -profit.expenses, 'text-bad'],
    ['Waste value', -profit.wasteValue, 'text-bad'],
    ['Estimated net', profit.estimatedNet, profit.estimatedNet >= 0 ? 'text-ok' : 'text-bad'],
  ]
  return (
    <>
      <Grid cols={4} className="mb-5">
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Revenue</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum text-ok">{formatMoney(profit.revenue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Gross profit</p>
          <p className={`mt-1.5 text-[23px] font-semibold tnum ${profit.grossProfit >= 0 ? 'text-ok' : 'text-bad'}`}>{formatMoney(profit.grossProfit)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Gross margin</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{profit.grossMargin}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Estimated net</p>
          <p className={`mt-1.5 text-[23px] font-semibold tnum ${profit.estimatedNet >= 0 ? 'text-ok' : 'text-bad'}`}>{formatMoney(profit.estimatedNet)}</p>
        </Card>
      </Grid>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Profit & loss (estimated)" className="p-5">
          <div className="divide-y divide-line">
            {rows.map(([label, value, tone]) => (
              <div key={label} className="flex items-center justify-between py-2.5">
                <span className={`text-[13.5px] ${label.includes('profit') || label.includes('net') ? 'font-semibold text-ink' : 'text-muted'}`}>{label}</span>
                <span className={`tnum font-medium ${tone}`}>{value < 0 ? '−' : ''}{formatMoney(Math.abs(value))}</span>
              </div>
            ))}
          </div>
          <p className="hint mt-4">
            Estimated — COGS is the recorded ingredient cost of batches completed in this period, not an audited accounting figure.
          </p>
        </Card>

        <Card title="Expenses by category" className="p-0">
          {expenses.length === 0 ? (
            <EmptyState title="No expenses in this period" icon={<Wallet size={24} />} />
          ) : (
            <TableWrap>
              <THead cols={['Category', 'Entries', 'Total']} />
              <tbody className="divide-y divide-line">
                {expenses.map((e) => (
                  <tr key={e.category} className="hover:bg-pale">
                    <td className="td">{e.category}</td>
                    <td className="td tnum text-muted">{e.count}</td>
                    <td className="td tnum font-medium text-bad">{formatMoney(e.total)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </div>
    </>
  )
}

/* ============================== Inventory ================================ */

function InventoryTab({
  inv, consumption, waste,
}: {
  inv: ReturnType<typeof inventoryReport>
  consumption: { ingredient_name: string; unit: string; quantity: number; cost: number; batches: number }[]
  waste: ReturnType<typeof wasteReport>
}) {
  return (
    <>
      <Grid cols={4} className="mb-5">
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Stock value</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{formatMoney(inv.valuationTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Ingredients</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{inv.totalCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Low stock</p>
          <p className={`mt-1.5 text-[23px] font-semibold tnum ${inv.low.length ? 'text-warn' : 'text-ok'}`}>{inv.low.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Expiring soon</p>
          <p className={`mt-1.5 text-[23px] font-semibold tnum ${inv.expiring.length ? 'text-warn' : 'text-ok'}`}>{inv.expiring.length}</p>
        </Card>
      </Grid>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Ingredient consumption" className="p-0">
          {consumption.length === 0 ? (
            <EmptyState title="Nothing consumed in this period" description="Completed production batches post ingredient consumption here." icon={<Package size={24} />} />
          ) : (
            <TableWrap>
              <THead cols={['Ingredient', 'Quantity', 'Batches', 'Cost']} />
              <tbody className="divide-y divide-line">
                {consumption.slice(0, 15).map((c, i) => (
                  <tr key={`${c.ingredient_name}-${i}`} className="hover:bg-pale">
                    <td className="td">{c.ingredient_name}</td>
                    <td className="td tnum">{c.quantity} {c.unit}</td>
                    <td className="td tnum text-muted">{c.batches}</td>
                    <td className="td tnum font-medium">{formatMoney(c.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card title="Waste in this period" className="p-0">
          {waste.count === 0 ? (
            <EmptyState title="No waste recorded" description="A clean period — nothing was thrown away." icon={<Package size={24} />} />
          ) : (
            <>
              <div className="px-5 py-3 bg-warm border-b border-line text-[13px] flex justify-between">
                <span className="text-muted">{waste.count} records</span>
                <span className="tnum font-medium text-bad">{formatMoney(waste.totalValue)}</span>
              </div>
              <TableWrap>
                <THead cols={['Category', 'Qty', 'Value']} />
                <tbody className="divide-y divide-line">
                  {waste.byCategory.map((c) => (
                    <tr key={c.category} className="hover:bg-pale">
                      <td className="td"><Badge tone="danger">{c.category}</Badge></td>
                      <td className="td tnum">{c.quantity}</td>
                      <td className="td tnum font-medium text-bad">{formatMoney(c.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            </>
          )}
        </Card>
      </div>
    </>
  )
}

/* ============================== Production =============================== */

function ProductionTab({ prod }: { prod: ReturnType<typeof productionReport> }) {
  const data = prod.byStatus.map((s) => ({ ...s }))
  if (prod.planned + prod.actual === 0 && data.length === 0) {
    return <EmptyState title="No production in this period" description="Completed batches show yield, ingredient cost and waste here." icon={<Factory size={26} />} />
  }
  return (
    <>
      <Grid cols={4} className="mb-5">
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Units planned</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{prod.planned}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Units produced</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum text-ok">{prod.actual}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Yield rate</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{prod.yieldRate}%</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Ingredient cost</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{formatMoney(prod.ingredientCost)}</p>
        </Card>
      </Grid>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Batches by status" className="p-5">
          {data.length === 0 ? (
            <EmptyState title="No batches" icon={<Factory size={24} />} />
          ) : (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="#F5E6DC" vertical={false} />
                  <XAxis dataKey="status" tick={{ fontSize: 10.5, fill: '#8A6F7B' }} tickLine={false} axisLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 11, fill: '#8A6F7B' }} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                  <RTooltip contentStyle={{ borderRadius: 12, border: '1px solid #F1E0D6', fontSize: 12, boxShadow: '0 12px 30px -18px rgba(61,38,51,.4)' }} />
                  <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                    {data.map((_, i) => (
                      <Cell key={i} fill={BARS[i % BARS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Quality" className="p-5">
          <div className="divide-y divide-line">
            {[
              ['Completed batches', prod.completed],
              ['Failed batches', prod.failed],
              ['Wasted units', prod.wasted],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-center justify-between py-3">
                <span className="text-[13.5px] text-muted">{label}</span>
                <span className="tnum font-semibold text-[15px]">{value as number}</span>
              </div>
            ))}
          </div>
          <p className="hint mt-4">
            Yield rate = actual units ÷ planned units across all batches in the selected period.
          </p>
        </Card>
      </div>
    </>
  )
}

/* =============================== Customers =============================== */

function CustomersTab({ cust }: { cust: ReturnType<typeof customerInsights> }) {
  if (cust.repeat.length === 0) {
    return <EmptyState title="No customers in this period" description="Repeat customers and their revenue appear here once they order." icon={<Users size={26} />} />
  }
  return (
    <>
      <Grid cols={3} className="mb-5">
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Customers with orders</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{cust.repeat.length + cust.oneTime}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Repeat buyers</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum text-ok">{cust.repeat.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">One-time buyers</p>
          <p className="mt-1.5 text-[23px] font-semibold tnum">{cust.oneTime}</p>
        </Card>
      </Grid>

      <Card title="Repeat customers" className="p-0">
        <TableWrap>
          <THead cols={['Customer', 'Orders', 'Revenue', 'Outstanding']} />
          <tbody className="divide-y divide-line">
            {cust.repeat.map((r) => (
              <tr key={r.customer_name} className="hover:bg-pale">
                <td className="td">{r.customer_name || 'Walk-in'}</td>
                <td className="td tnum">{r.orders}</td>
                <td className="td tnum font-medium">{formatMoney(r.revenue)}</td>
                <td className={`td tnum ${r.outstanding > 0 ? 'text-warn font-medium' : 'text-muted'}`}>{formatMoney(r.outstanding)}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      </Card>
    </>
  )
}
