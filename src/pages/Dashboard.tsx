import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ClipboardList, Truck, Wallet, TrendingUp, HandCoins, Activity, Boxes, Factory,
  Plus, UserPlus, Cake as CakeIcon, BookOpen, Receipt, PackagePlus, CalendarClock,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip,
  XAxis, YAxis,
} from 'recharts'
import { PageHeader, Card, Grid, Badge, EmptyState, STATUS_TONE, Money, TableWrap, THead } from '../components/ui'
import { StatCard } from '../components/StatCard'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import { formatMoney } from '../lib/format'
import { formatDisplayDate, todayKey, addDays, relativeDay } from '../lib/dates'
import { getDateFormat } from '../lib/format'
import {
  dashboardKpis, revenueSeries, topProducts, statusDistribution, recentActivity, productionSummary, pendingTasks, inventoryReport,
} from '../repositories/reports'
import { hasAnyData } from '../repositories/settings'
import { seedSampleData } from '../repositories/sampleData'

const PIE_COLORS = ['#E8A3BA', '#C96F91', '#75A98A', '#E4AD65', '#D77A83', '#F0C0D1', '#8D7D85']

export function DashboardPage() {
  const settings = useApp((s) => s.settings)
  const bump = useApp((s) => s.bump)
  const toast = useApp((s) => s.toast)
  const nav = useNavigate()
  const [range, setRange] = useState<'30' | '90' | '365'>('30')
  const [seeded, setSeeded] = useState(false)

  const data = useLive(() => {
    const k = dashboardKpis()
    const to = todayKey()
    const from = addDays(to, -Number(range))
    const series = revenueSeries(from, to)
    const products = topProducts(6)
    const statuses = statusDistribution()
    const activity = recentActivity(7)
    const batches = productionSummary(5)
    const tasks = pendingTasks()
    const empty = !hasAnyData()
    return { k, series, products, statuses, activity, batches, tasks, empty }
  }, [range])

  const chartMax = Math.max(...data.series.map((s) => Math.max(s.revenue, s.payments)), 1)

  const quickActions = [
    { label: 'Add Order', icon: ClipboardList, to: '/orders?new=1' },
    { label: 'Add Customer', icon: UserPlus, to: '/customers?new=1' },
    { label: 'Add Product', icon: CakeIcon, to: '/products?new=1' },
    { label: 'Add Recipe', icon: BookOpen, to: '/recipes?new=1' },
    { label: 'Record Expense', icon: Receipt, to: '/finances?new=expense' },
    { label: 'Record Purchase', icon: PackagePlus, to: '/suppliers?new=purchase' },
    { label: 'Production Batch', icon: Factory, to: '/production?new=1' },
  ]

  return (
    <>
      <PageHeader
        title={settings?.bakery_name ? `Good to see you, ${settings.bakery_name}` : 'Overview'}
        subtitle={formatDisplayDate(todayKey(), getDateFormat())}
        actions={
          <>
            <select className="input !w-auto" value={range} onChange={(e) => setRange(e.target.value as never)}>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last 12 months</option>
            </select>
            <button className="btn-primary" onClick={() => nav('/orders?new=1')}>
              <Plus size={15} /> Add order
            </button>
          </>
        }
      />

      {data.empty && !seeded && (
        <Card className="p-6 mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-pink-100 text-pink-500 grid place-items-center shrink-0 text-2xl">🧁</div>
            <div className="flex-1">
              <h3 className="section-title">Your bakery is ready to fill</h3>
              <p className="text-sm text-muted mt-1 leading-relaxed max-w-2xl">
                Start by adding an ingredient, a recipe and a product — then take your first order. Everything you enter
                stays on this device and works without internet.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  const res = seedSampleData()
                  setSeeded(true)
                  bump()
                  toast(
                    res.created ? 'success' : 'info',
                    res.created ? 'Sample bakery loaded' : 'Sample data already present',
                    'Every demo row is labelled and can be removed in Settings → Sample data.'
                  )
                }}
              >
                Load sample data
              </button>
              <button className="btn-primary" onClick={() => nav('/recipes?new=1')}>
                Add a recipe
              </button>
            </div>
          </div>
        </Card>
      )}

      {/* KPI row */}
      <Grid cols={4} className="mb-6">
        <StatCard label="Today's orders" value={data.k.todayOrders} icon={<ClipboardList size={20} />} to="/orders" sub="Due today" />
        <StatCard
          label="Upcoming deliveries"
          value={data.k.upcomingDeliveries}
          icon={<Truck size={20} />}
          to="/orders"
          sub="Next 7 days"
        />
        <StatCard
          label="Revenue (booked)"
          value={formatMoney(data.k.revenue, { compact: true })}
          icon={<Wallet size={20} />}
          to="/reports"
          tone="good"
          hint="Sum of all non-cancelled order totals — money promised, not necessarily received yet."
        />
        <StatCard
          label="Estimated profit"
          value={formatMoney(data.k.estimatedProfit, { compact: true })}
          icon={<TrendingUp size={20} />}
          to="/reports"
          tone={data.k.estimatedProfit >= 0 ? 'good' : 'bad'}
          hint="Booked revenue minus recorded ingredient costs, recorded expenses and refunds. An estimate, not an accounting result."
        />
        <StatCard
          label="Outstanding payments"
          value={formatMoney(data.k.outstanding, { compact: true })}
          icon={<HandCoins size={20} />}
          to="/orders?payment=Unpaid"
          tone={data.k.outstanding > 0 ? 'warn' : 'neutral'}
        />
        <StatCard label="Active orders" value={data.k.activeOrders} icon={<Activity size={20} />} to="/orders" sub="Not completed or cancelled" />
        <StatCard
          label="Low-stock ingredients"
          value={data.k.lowStock}
          icon={<Boxes size={20} />}
          to="/inventory"
          tone={data.k.lowStock > 0 ? 'bad' : 'neutral'}
        />
        <StatCard
          label="Pending production"
          value={data.k.pendingProduction}
          icon={<Factory size={20} />}
          to="/production"
          sub="Batches still to finish"
        />
      </Grid>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Revenue trend */}
        <Card className="lg:col-span-2 p-5" title="Revenue trend" action={
          <div className="flex items-center gap-3 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-pink-400" /> Booked</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-ok" /> Received</span>
          </div>
        }>
          {data.series.length === 0 ? (
            <EmptyState
              title="No revenue yet"
              description="Once you create orders and record payments, your trend appears here."
              icon={<TrendingUp size={26} />}
            />
          ) : (
            <div className="h-[260px] -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#E8A3BA" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#E8A3BA" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#F0DDE4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8D7D85' }} tickLine={false} axisLine={{ stroke: '#F0DDE4' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8D7D85' }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) => formatMoney(v, { compact: true })}
                    domain={[0, chartMax]}
                  />
                  <RTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #F0DDE4', fontSize: 12 }}
                    labelStyle={{ color: '#493B42' }}
                    formatter={(v: number, n: string) => [formatMoney(v), n === 'revenue' ? 'Booked' : 'Received']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#E8A3BA" strokeWidth={2} fill="url(#g1)" />
                  <Area type="monotone" dataKey="payments" stroke="#75A98A" strokeWidth={1.75} fill="none" strokeDasharray="4 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Status distribution */}
        <Card className="p-5" title="Order status">
          {data.statuses.length === 0 ? (
            <EmptyState title="No orders yet" description="Your status breakdown appears here." />
          ) : (
            <div className="h-[190px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.statuses} dataKey="count" nameKey="status" innerRadius={48} outerRadius={72} paddingAngle={2}>
                    {data.statuses.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <RTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #F0DDE4', fontSize: 12 }}
                    formatter={(v: number) => [v, 'Orders']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="space-y-1.5 mt-3">
            {data.statuses.map((s) => (
              <Link key={s.status} to={`/orders?status=${encodeURIComponent(s.status)}`} className="flex items-center gap-2 text-[12.5px] hover:text-pink-600">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[data.statuses.findIndex((x) => x.status === s.status) % PIE_COLORS.length] }} />
                <span className="text-muted">{s.status}</span>
                <span className="ml-auto tnum text-ink font-medium">{s.count}</span>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Best sellers */}
        <Card className="lg:col-span-2" title="Best-selling products" action={<Link to="/reports" className="text-[12.5px] text-pink-600 hover:underline">All reports</Link>}>
          {data.products.length === 0 ? (
            <EmptyState title="Nothing sold yet" description="Products that sell will be ranked here by revenue." icon={<CakeIcon size={26} />} />
          ) : (
            <div className="h-[240px] px-3 pb-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.products} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#F0DDE4" vertical={false} />
                  <XAxis dataKey="product_name" tick={{ fontSize: 10, fill: '#8D7D85' }} tickLine={false} axisLine={false} interval={0} height={54} angle={-18} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: '#8D7D85' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                  <RTooltip contentStyle={{ borderRadius: 12, border: '1px solid #F0DDE4', fontSize: 12 }} formatter={(v: number) => [formatMoney(v), 'Revenue']} />
                  <Bar dataKey="revenue" fill="#E8A3BA" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Inventory warnings */}
        <Card className="p-0" title="Inventory warnings">
          <InventoryWarnings />
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Production */}
        <Card title="Production tasks" action={<Link to="/production" className="text-[12.5px] text-pink-600 hover:underline">Open</Link>}>
          {data.batches.length === 0 ? (
            <EmptyState title="No production yet" description="Turn confirmed orders into production batches." icon={<Factory size={26} />} />
          ) : (
            <div className="divide-y divide-line">
              {data.batches.map((b) => (
                <Link key={b.id} to="/production" className="flex items-center gap-3 px-5 py-3 hover:bg-pink-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">{b.product_name}</p>
                    <p className="text-[11.5px] text-muted">
                      {b.batch_no} · {formatDisplayDate(b.production_date, getDateFormat())}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[b.status] ?? 'neutral'}>{b.status}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Tasks */}
        <Card title="Open tasks" action={<Link to="/calendar" className="text-[12.5px] text-pink-600 hover:underline">Calendar</Link>}>
          {data.tasks.length === 0 ? (
            <EmptyState title="Nothing pending" description="Tasks you create show up here and on the calendar." icon={<CalendarClock size={26} />} />
          ) : (
            <div className="divide-y divide-line">
              {data.tasks.map((t) => (
                <Link key={t.id} to="/calendar" className="flex items-center gap-3 px-5 py-3 hover:bg-pink-50">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink truncate">{t.title}</p>
                    {t.due_date && (
                      <p className={`text-[11.5px] ${t.due_date < todayKey() ? 'text-bad' : 'text-muted'}`}>{relativeDay(t.due_date)}</p>
                    )}
                  </div>
                  <Badge tone={STATUS_TONE[t.priority] ?? 'neutral'}>{t.priority}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card title="Recent activity">
          {data.activity.length === 0 ? (
            <EmptyState title="No activity yet" description="Everything you do is recorded here for audit purposes." />
          ) : (
            <div className="divide-y divide-line">
              {data.activity.map((a) => (
                <div key={a.id} className="px-5 py-2.5">
                  <p className="text-[13px] text-ink">
                    <span className="capitalize text-pink-600 font-medium">{a.action.replace(/_/g, ' ')}</span>{' '}
                    <span className="text-muted">· {a.entity}</span>
                  </p>
                  {a.detail && <p className="text-[11.5px] text-muted truncate">{a.detail}</p>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Quick actions */}
      <Card title="Quick actions" className="p-0">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {quickActions.map((a) => (
            <button
              key={a.label}
              onClick={() => nav(a.to)}
              className="flex flex-col items-center gap-2 rounded-xl border border-line bg-white px-2 py-4 hover:border-pink-300 hover:bg-pink-50 transition text-center"
            >
              <a.icon size={19} className="text-pink-500" />
              <span className="text-[11.5px] text-ink leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </>
  )
}

function InventoryWarnings() {
  const rows = useLive(() => inventoryReport(), [])
  const { low, expiring } = rows
  if (!low.length && !expiring.length) {
    return <EmptyState title="Stock looks healthy" description="Nothing is below its minimum level right now." icon={<Boxes size={26} />} />
  }
  return (
    <div className="divide-y divide-line max-h-[300px] overflow-y-auto">
      {low.map((r) => (
        <Link key={r.id} to="/inventory" className="flex items-center gap-3 px-5 py-3 hover:bg-pink-50">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink truncate">{r.name}</p>
            <p className="text-[11.5px] text-muted">
              {r.current_stock} / min {r.min_stock} {r.purchase_unit}
            </p>
          </div>
          <Badge tone={r.current_stock <= 0 ? 'danger' : 'warning'}>{r.current_stock <= 0 ? 'Out' : 'Low'}</Badge>
        </Link>
      ))}
      {expiring.map((e) => (
        <Link key={e.id} to="/inventory" className="flex items-center gap-3 px-5 py-3 hover:bg-pink-50">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink truncate">{e.name}</p>
            <p className="text-[11.5px] text-muted">Expires {formatDisplayDate(e.expiry_date, getDateFormat())}</p>
          </div>
          <Badge tone="warning">{e.days_left}d</Badge>
        </Link>
      ))}
    </div>
  )
}
