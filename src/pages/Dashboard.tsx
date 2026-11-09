import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ClipboardList, Truck, Wallet, TrendingUp, HandCoins, Activity, Boxes, Factory,
  Plus, UserPlus, Cake as CakeIcon, BookOpen, Receipt, PackagePlus, CalendarClock,
  Sparkles, ArrowRight, Clock3,
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

const PIE_COLORS = ['#E35683', '#F59E6B', '#F4C95D', '#58C99A', '#62B4E8', '#A78BFA', '#D9536B']

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
        title="Overview"
        subtitle={`${formatDisplayDate(todayKey(), getDateFormat())} · your whole bakery in one place`}
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

      <section className="relative overflow-hidden rounded-3xl hero-mesh text-white shadow-card mb-6 animate-rise">
        <div className="pointer-events-none absolute inset-0 hero-ring opacity-70" />
        <div className="pointer-events-none absolute -left-20 -bottom-24 w-72 h-72 rounded-full bg-mint/20 blur-3xl" />
        <div className="pointer-events-none absolute right-1 top-0 hidden md:block animate-floaty">
          <HeroCupcake />
        </div>
        <div className="relative p-6 sm:p-8 md:max-w-[62%]">
          <p className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-semibold text-[#F8D98A]">
            <Sparkles size={13} /> Today in your bakery
          </p>
          <h2 className="font-display text-[29px] sm:text-[35px] leading-[1.08] mt-2">
            {settings?.bakery_name ? (
              <>
                Everything rising at <span className="text-[#F8D98A]">{settings.bakery_name}</span>
              </>
            ) : (
              'Your bakery, at a glance'
            )}
          </h2>
          <p className="text-[13.5px] text-[#F7E4EA]/80 mt-2 max-w-lg leading-relaxed">
            Orders, production, stock and money — one warm workspace that works fully offline.
          </p>
          <div className="flex flex-wrap gap-2 mt-5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-[11.5px] text-white/90 backdrop-blur">
              <span className="w-1.5 h-1.5 rounded-full bg-butter" />
              <b className="font-semibold">{data.k.todayOrders}</b> due today
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-[11.5px] text-white/90 backdrop-blur">
              <span className="w-1.5 h-1.5 rounded-full bg-mint" />
              <b className="font-semibold">{data.k.upcomingDeliveries}</b> deliveries this week
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 border border-white/15 px-3 py-1.5 text-[11.5px] text-white/90 backdrop-blur">
              <Clock3 size={12} className="text-[#9ED2F2]" />
              <b className="font-semibold">{data.tasks.length}</b> open tasks
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 mt-5">
            <button className="hero-cta" onClick={() => nav('/orders?new=1')}>
              <Plus size={15} /> Add order
            </button>
            <Link
              to="/reports"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl text-[13px] font-medium text-white/90 bg-white/10 border border-white/20 hover:bg-white/15 transition"
            >
              See reports <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </section>

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
        <StatCard label="Today's orders" value={data.k.todayOrders} icon={<ClipboardList size={18} />} to="/orders" sub="Due today" />
        <StatCard
          label="Upcoming deliveries"
          value={data.k.upcomingDeliveries}
          icon={<Truck size={18} />}
          to="/orders"
          sub="Next 7 days"
        />
        <StatCard
          label="Revenue (booked)"
          value={formatMoney(data.k.revenue, { compact: true })}
          icon={<Wallet size={18} />}
          to="/reports"
          tone="good"
          hint="Sum of all non-cancelled order totals — money promised, not necessarily received yet."
        />
        <StatCard
          label="Estimated profit"
          value={formatMoney(data.k.estimatedProfit, { compact: true })}
          icon={<TrendingUp size={18} />}
          to="/reports"
          tone={data.k.estimatedProfit >= 0 ? 'good' : 'bad'}
          hint="Booked revenue minus recorded ingredient costs, recorded expenses and refunds. An estimate, not an accounting result."
        />
        <StatCard
          label="Outstanding payments"
          value={formatMoney(data.k.outstanding, { compact: true })}
          icon={<HandCoins size={18} />}
          to="/orders?payment=Unpaid"
          tone={data.k.outstanding > 0 ? 'warn' : 'neutral'}
        />
        <StatCard label="Active orders" value={data.k.activeOrders} icon={<Activity size={18} />} to="/orders" sub="Not completed or cancelled" />
        <StatCard
          label="Low-stock ingredients"
          value={data.k.lowStock}
          icon={<Boxes size={18} />}
          to="/inventory"
          tone={data.k.lowStock > 0 ? 'bad' : 'good'}
        />
        <StatCard
          label="Pending production"
          value={data.k.pendingProduction}
          icon={<Factory size={18} />}
          to="/production"
          sub="Batches still to finish"
        />
      </Grid>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Revenue trend */}
        <Card
          className="lg:col-span-2 p-5"
          title="Revenue trend"
          icon={<TrendingUp size={16} />}
          accent="from-[#FFE1EA] to-[#FFF6EC] text-[#C93E6B]"
          action={
            <div className="flex items-center gap-3 text-[11.5px] text-muted">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#E35683]" /> Booked</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-mint" /> Received</span>
            </div>
          }
        >
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
                      <stop offset="0%" stopColor="#E35683" stopOpacity={0.38} />
                      <stop offset="100%" stopColor="#E35683" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#F5E6DC" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A6F7B' }} tickLine={false} axisLine={{ stroke: '#F1E0D6' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8A6F7B' }}
                    tickLine={false}
                    axisLine={false}
                    width={52}
                    tickFormatter={(v: number) => formatMoney(v, { compact: true })}
                    domain={[0, chartMax]}
                  />
                  <RTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #F1E0D6', fontSize: 12, boxShadow: '0 12px 30px -18px rgba(61,38,51,.4)' }}
                    labelStyle={{ color: '#3D2633' }}
                    formatter={(v: number, n: string) => [formatMoney(v), n === 'revenue' ? 'Booked' : 'Received']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#E35683" strokeWidth={2.5} fill="url(#g1)" />
                  <Area type="monotone" dataKey="payments" stroke="#3FA372" strokeWidth={2} fill="none" strokeDasharray="4 3" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Status distribution */}
        <Card
          className="p-5"
          title="Order status"
          icon={<Activity size={16} />}
          accent="from-[#E4F2FC] to-[#F7FCFF] text-[#2A6F9B]"
        >
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
                    contentStyle={{ borderRadius: 12, border: '1px solid #F1E0D6', fontSize: 12, boxShadow: '0 12px 30px -18px rgba(61,38,51,.4)' }}
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
        <Card
          className="lg:col-span-2"
          title="Best-selling products"
          icon={<CakeIcon size={16} />}
          accent="from-[#FFF0CC] to-[#FFFBF0] text-[#B07A17]"
          action={<Link to="/reports" className="text-[12.5px] font-medium text-pink-600 hover:underline">All reports</Link>}
        >
          {data.products.length === 0 ? (
            <EmptyState title="Nothing sold yet" description="Products that sell will be ranked here by revenue." icon={<CakeIcon size={26} />} />
          ) : (
            <div className="h-[240px] px-3 pb-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.products} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#F5E6DC" vertical={false} />
                  <XAxis dataKey="product_name" tick={{ fontSize: 10, fill: '#8A6F7B' }} tickLine={false} axisLine={false} interval={0} height={54} angle={-18} textAnchor="end" />
                  <YAxis tick={{ fontSize: 11, fill: '#8A6F7B' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => formatMoney(v, { compact: true })} />
                  <RTooltip
                    contentStyle={{ borderRadius: 12, border: '1px solid #F1E0D6', fontSize: 12, boxShadow: '0 12px 30px -18px rgba(61,38,51,.4)' }}
                    formatter={(v: number) => [formatMoney(v), 'Revenue']}
                  />
                  <Bar dataKey="revenue" radius={[8, 8, 2, 2]}>
                    {data.products.map((p, i) => (
                      <Cell key={p.product_name} fill={['#E35683', '#F59E6B', '#F4C95D', '#58C99A', '#62B4E8', '#A78BFA'][i % 6]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Inventory warnings */}
        <Card
          className="p-0"
          title="Inventory warnings"
          icon={<Boxes size={16} />}
          accent="from-[#E4F6EC] to-[#F7FDF9] text-[#2F7A56]"
        >
          <InventoryWarnings />
        </Card>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        {/* Production */}
        <Card
          title="Production tasks"
          icon={<Factory size={16} />}
          accent="from-[#F1EBFF] to-[#FBF8FF] text-[#7B5CD6]"
          action={<Link to="/production" className="text-[12.5px] font-medium text-pink-600 hover:underline">Open</Link>}
        >
          {data.batches.length === 0 ? (
            <EmptyState title="No production yet" description="Turn confirmed orders into production batches." icon={<Factory size={26} />} />
          ) : (
            <div className="divide-y divide-line">
              {data.batches.map((b) => (
                <Link key={b.id} to="/production" className="flex items-center gap-3 px-5 py-3 hover:bg-pink-50/70">
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
        <Card
          title="Open tasks"
          icon={<CalendarClock size={16} />}
          accent="from-[#E4F2FC] to-[#F7FCFF] text-[#2A6F9B]"
          action={<Link to="/calendar" className="text-[12.5px] font-medium text-pink-600 hover:underline">Calendar</Link>}
        >
          {data.tasks.length === 0 ? (
            <EmptyState title="Nothing pending" description="Tasks you create show up here and on the calendar." icon={<CalendarClock size={26} />} />
          ) : (
            <div className="divide-y divide-line">
              {data.tasks.map((t) => (
                <Link key={t.id} to="/calendar" className="flex items-center gap-3 px-5 py-3 hover:bg-pink-50/70">
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
        <Card
          title="Recent activity"
          icon={<Activity size={16} />}
          accent="from-[#FFE9E4] to-[#FFF9F6] text-[#C8545F]"
        >
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
      <Card title="Quick actions" className="p-0" icon={<Sparkles size={16} />} accent="from-[#FFE1EA] to-[#FFF6EC] text-[#C93E6B]">
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
          {quickActions.map((a, i) => (
            <button
              key={a.label}
              onClick={() => nav(a.to)}
              className="group flex flex-col items-center gap-2 rounded-2xl border border-line bg-white px-2 py-4 hover:border-pink-200 hover:shadow-card transition text-center"
            >
              <span
                className={`w-10 h-10 rounded-xl grid place-items-center bg-gradient-to-br shadow-sm group-hover:scale-105 transition ${[
                  'from-[#FFE1EA] to-[#FFF6EC] text-[#C93E6B]',
                  'from-[#FFF0CC] to-[#FFFAF0] text-[#B07A17]',
                  'from-[#F1EBFF] to-[#FBF8FF] text-[#7B5CD6]',
                  'from-[#E4F2FC] to-[#F7FCFF] text-[#2A6F9B]',
                  'from-[#E4F6EC] to-[#F7FDF9] text-[#2F7A56]',
                  'from-[#FFE9E4] to-[#FFF9F6] text-[#C8545F]',
                  'from-[#FFF1E4] to-[#FFFBF6] text-[#C97A3F]',
                ][i % 7]}`}
              >
                <a.icon size={18} />
              </span>
              <span className="text-[11.5px] text-ink leading-tight">{a.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </>
  )
}

function HeroCupcake() {
  return (
    <svg width="215" height="215" viewBox="0 0 210 210" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ubt-wrapper" x1="58" y1="122" x2="152" y2="192" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8D98A" />
          <stop offset="1" stopColor="#F59E6B" />
        </linearGradient>
        <linearGradient id="ubt-frosting" x1="58" y1="56" x2="152" y2="130" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFBF5" />
          <stop offset="1" stopColor="#FFDDE8" />
        </linearGradient>
      </defs>
      <ellipse cx="105" cy="196" rx="62" ry="9" fill="#2A0F19" opacity="0.28" />
      <path d="M58 124h94l-11 56c-1.4 7-7.3 12-14.4 12H83.4c-7.1 0-13-5-14.4-12l-11-56Z" fill="url(#ubt-wrapper)" />
      <path
        d="M74 132l-6 46M98 132v50M122 132v50M146 132l6 46"
        stroke="#D9783F"
        strokeWidth="3.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M63 126c-2.8-11 4.8-20 15.6-20 3.2-11.5 16.4-17 25-9.4 8.6-7.6 21.8-2.1 25 9.4 10.8 0 18.4 9 15.6 20H63Z"
        fill="url(#ubt-frosting)"
      />
      <path
        d="M67 104c6-11 17-16 30-14M87 92c3-8 10-12 19-11M117 87c7-2 14 1 19 8"
        stroke="#F6B7C9"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.9"
      />
      <circle cx="105" cy="72" r="9.5" fill="#D9536B" />
      <path d="M105 63c2.5-8 9-12.5 17-12.5" stroke="#3B2230" strokeWidth="3.2" strokeLinecap="round" />
      <g strokeLinecap="round" strokeWidth="3">
        <path d="M80 116l4-7" stroke="#58C99A" />
        <path d="M95 124l3-6" stroke="#62B4E8" />
        <path d="M113 117l-3-7" stroke="#F4C95D" />
        <path d="M130 122l4-6" stroke="#A78BFA" />
        <path d="M139 108l3-6" stroke="#F59E6B" />
      </g>
      <g fill="#FFF8F0" opacity="0.55">
        <circle cx="74" cy="86" r="2.2" />
        <circle cx="136" cy="80" r="2.2" />
        <circle cx="150" cy="99" r="1.7" />
      </g>
    </svg>
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
