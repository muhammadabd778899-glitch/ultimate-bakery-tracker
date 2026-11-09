import { useEffect, useMemo, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, ClipboardList, Users, Cake, BookOpen, Boxes, Factory, CalendarDays,
  Truck, Wallet, BarChart3, Settings as Cog, ChevronsLeft, ChevronsRight, Plus, Bell,
  Search, Trash2, X, PackageOpen, Menu,
} from 'lucide-react'
import { useApp } from '../store/app'
import { useLive } from '../lib/useLive'
import { query } from '../db/database'
import { formatDisplayDate, todayKey, relativeDay } from '../lib/dates'
import { getDateFormat } from '../lib/format'
import { Modal, Badge, EmptyState, STATUS_TONE } from '../components/ui'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true, accent: '#FBA3BE' },
  { to: '/orders', label: 'Orders', icon: ClipboardList, accent: '#F9B98C' },
  { to: '/customers', label: 'Customers', icon: Users, accent: '#F8D98A' },
  { to: '/products', label: 'Products & Menu', icon: Cake, accent: '#C4B5FD' },
  { to: '/recipes', label: 'Recipes', icon: BookOpen, accent: '#9ED2F2' },
  { to: '/inventory', label: 'Inventory', icon: Boxes, accent: '#9CE2C4' },
  { to: '/production', label: 'Production', icon: Factory, accent: '#F5A3B9' },
  { to: '/waste', label: 'Waste', icon: Trash2, accent: '#F6A290' },
  { to: '/calendar', label: 'Calendar & Tasks', icon: CalendarDays, accent: '#9ED2F2' },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, accent: '#F9C98E' },
  { to: '/finances', label: 'Finances', icon: Wallet, accent: '#9CE2C4' },
  { to: '/reports', label: 'Reports', icon: BarChart3, accent: '#F8D98A' },
  { to: '/settings', label: 'Settings', icon: Cog, accent: '#D9B8C6' },
]

interface Hit {
  kind: string
  label: string
  sub: string
  to: string
}

export function AppShell() {
  const collapsed = useApp((s) => s.sidebarCollapsed)
  const toggle = useApp((s) => s.toggleSidebar)
  const settings = useApp((s) => s.settings)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const navigate = useNavigate()

  const alerts = useLive(() => {
    const low = query<{ name: string }>(
      `SELECT name FROM ingredients WHERE min_stock > 0 AND current_stock <= min_stock ORDER BY name LIMIT 20`
    )
    const overdue = query<{ title: string; due_date: string }>(
      `SELECT title, due_date FROM tasks WHERE status <> 'Completed' AND due_date IS NOT NULL AND date(due_date) < date(?) ORDER BY due_date LIMIT 20`,
      [todayKey()]
    )
    const dueToday = query<{ order_no: string; customer_name: string }>(
      `SELECT order_no, customer_name FROM orders WHERE due_date = ? AND status NOT IN ('Completed','Cancelled') AND archived_at IS NULL`,
      [todayKey()]
    )
    return { low, overdue, dueToday }
  }, [])

  const alertCount = alerts.low.length + alerts.overdue.length + alerts.dueToday.length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
      if (e.key === 'Escape') {
        setPaletteOpen(false)
        setQuickOpen(false)
        setBellOpen(false)
        setMobileOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const quickActions = [
    { label: 'Add Order', to: '/orders?new=1', icon: ClipboardList },
    { label: 'Add Customer', to: '/customers?new=1', icon: Users },
    { label: 'Add Product', to: '/products?new=1', icon: Cake },
    { label: 'Add Recipe', to: '/recipes?new=1', icon: BookOpen },
    { label: 'Record Expense', to: '/finances?new=expense', icon: Wallet },
    { label: 'Record Purchase', to: '/suppliers?new=purchase', icon: PackageOpen },
    { label: 'Create Production Batch', to: '/production?new=1', icon: Factory },
  ]

  return (
    <div className="min-h-screen flex bg-pale">
      {/* ---------------- Sidebar ---------------- */}
      <aside
        className={`no-print sidebar-shell fixed lg:static inset-y-0 left-0 z-40 flex flex-col border-r border-white/10 transition-all duration-200 w-[232px] ${
          collapsed ? 'lg:w-[68px]' : ''
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}
      >
        <div className="relative h-16 flex items-center gap-2.5 px-4 border-b border-white/10 shrink-0 overflow-hidden">
          <div className="pointer-events-none absolute inset-0 sidebar-sprinkles opacity-40" />
          <div className="relative w-10 h-10 rounded-2xl bg-gradient-to-br from-[#F8D98A] via-[#F1789E] to-[#C93E6B] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.6)] ring-1 ring-white/30 grid place-items-center shrink-0">
            <Cake size={19} className="text-white drop-shadow-[0_1px_2px_rgba(90,26,46,0.5)]" />
          </div>
          <div className={`relative min-w-0 ${collapsed ? 'lg:hidden' : ''}`}>
            <p className="font-display text-[15px] leading-tight text-white truncate">
              {settings?.bakery_name || 'Bakery Tracker'}
            </p>
            <p className="text-[9px] uppercase tracking-[0.12em] text-[#F9C9D8]/70 leading-tight mt-0.5 whitespace-nowrap">
              Premium offline suite
            </p>
          </div>
        </div>

        <p
          className={`px-5 pt-4 pb-1.5 text-[9.5px] uppercase tracking-[0.18em] text-white/40 font-semibold ${
            collapsed ? 'lg:hidden' : ''
          }`}
        >
          Bakery workspace
        </p>

        <nav className="relative flex-1 overflow-y-auto py-1.5 px-2 space-y-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              onClick={() => {
                if (window.innerWidth < 1024) setMobileOpen(false)
              }}
              title={collapsed ? n.label : undefined}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 rounded-xl px-3 h-10 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-white/[0.13] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]'
                    : 'text-[#F3DDE5]/75 hover:bg-white/[0.07] hover:text-white'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                      style={{ background: n.accent }}
                    />
                  )}
                  <span
                    className="shrink-0 transition-transform group-hover:scale-110"
                    style={{ color: isActive ? '#FFFFFF' : n.accent }}
                  >
                    <n.icon size={17} />
                  </span>
                  <span className={`truncate ${collapsed ? 'lg:hidden' : ''}`}>{n.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="p-2 border-t border-white/10 shrink-0">
          <button
            className="w-full flex items-center gap-3 rounded-xl px-3 h-9 text-[12.5px] text-[#F3DDE5]/65 hover:bg-white/10 hover:text-white transition"
            onClick={() => {
              if (window.innerWidth < 1024) setMobileOpen(false)
              else toggle()
            }}
          >
            <ChevronsRight size={16} className={collapsed ? 'hidden lg:block' : 'hidden'} />
            <ChevronsLeft size={16} className={collapsed ? 'lg:hidden' : ''} />
            <span className={collapsed ? 'lg:hidden' : ''}>Collapse</span>
          </button>
        </div>
      </aside>

      {mobileOpen && (
        <div
          className="fixed inset-0 z-[35] bg-ink/40 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ---------------- Main ---------------- */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="no-print h-16 sticky top-0 z-30 bg-[#FFF8F3]/85 backdrop-blur-xl border-b border-line flex items-center gap-2 sm:gap-3 px-3 sm:px-6">
          <button
            className="lg:hidden w-9 h-9 shrink-0 rounded-xl border border-line bg-white/75 grid place-items-center text-ink hover:bg-pink-50 transition"
            onClick={() => setMobileOpen(true)}
            title="Open menu"
            aria-label="Open menu"
          >
            <Menu size={17} />
          </button>
          <div className="hidden md:flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/75 border border-line text-[12px] text-muted tnum shrink-0">
            <CalendarDays size={13} className="text-pink-500" />
            {formatDisplayDate(todayKey(), getDateFormat())}
          </div>

          <button
            className="flex-1 min-w-0 max-w-md flex items-center gap-2 h-9 rounded-full border border-line bg-white/75 px-3.5 text-[13px] text-muted hover:border-pink-300 hover:bg-white transition"
            onClick={() => setPaletteOpen(true)}
          >
            <Search size={14} className="text-pink-500 shrink-0" />
            <span className="truncate">Search orders, customers, products…</span>
            <kbd className="ml-auto text-[10px] border border-line rounded-full px-1.5 py-0.5 bg-cream text-muted hidden sm:block">Ctrl K</kbd>
          </button>

          <div className="flex items-center gap-1.5 ml-auto">
            <div className="relative">
              <button
                className="relative w-9 h-9 rounded-xl hover:bg-pink-50 grid place-items-center text-muted hover:text-ink transition"
                onClick={() => setBellOpen((v) => !v)}
                title="Attention needed"
              >
                <Bell size={17} />
                {alertCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-bad text-white text-[10px] grid place-items-center tnum">
                    {alertCount}
                  </span>
                )}
              </button>
              {bellOpen && (
                <div className="absolute right-0 mt-2 w-[330px] max-w-[90vw] card shadow-pop z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                    <p className="text-sm font-semibold">Needs attention</p>
                    <button onClick={() => setBellOpen(false)} className="text-muted">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="max-h-[340px] overflow-y-auto divide-y divide-line">
                    {alerts.dueToday.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5">Due today</p>
                        {alerts.dueToday.map((o, i) => (
                          <button
                            key={i}
                            className="block w-full text-left text-[13px] text-ink py-1 hover:text-pink-600"
                            onClick={() => {
                              setBellOpen(false)
                              navigate('/orders')
                            }}
                          >
                            {o.order_no} · {o.customer_name || 'Walk-in'}
                          </button>
                        ))}
                      </div>
                    )}
                    {alerts.low.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5">Low stock</p>
                        {alerts.low.map((i, idx) => (
                          <p key={idx} className="text-[13px] text-ink py-1">
                            {i.name}
                          </p>
                        ))}
                      </div>
                    )}
                    {alerts.overdue.length > 0 && (
                      <div className="px-4 py-3">
                        <p className="text-[11px] uppercase tracking-wide text-muted font-semibold mb-1.5">Overdue tasks</p>
                        {alerts.overdue.map((t, idx) => (
                          <p key={idx} className="text-[13px] text-ink py-1">
                            {t.title} <span className="text-bad text-[11.5px]">· {relativeDay(t.due_date!)}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    {alertCount === 0 && <p className="px-4 py-6 text-sm text-muted text-center">Nothing needs attention.</p>}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button className="btn-primary !h-9 !px-3" onClick={() => setQuickOpen((v) => !v)}>
                <Plus size={15} />
                <span className="hidden sm:inline">Quick add</span>
              </button>
              {quickOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setQuickOpen(false)} />
                  <div className="absolute right-0 mt-2 w-60 card shadow-pop z-40 py-1.5">
                    {quickActions.map((a) => (
                      <button
                        key={a.label}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13.5px] text-ink hover:bg-pink-50 text-left"
                        onClick={() => {
                          setQuickOpen(false)
                          navigate(a.to)
                        }}
                      >
                        <a.icon size={15} className="text-pink-500" />
                        {a.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1500px] w-full mx-auto">
          <Outlet />
        </main>

        <footer className="no-print px-6 py-3 border-t border-line text-[11.5px] text-muted flex flex-wrap gap-x-4 gap-y-1 bg-white/55 backdrop-blur">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-mint shadow-[0_0_0_3px_rgba(88,201,154,0.18)]" />
            Local database · saved on this device
          </span>
          <span>{settings?.bakery_name ? `${settings.bakery_name} · ` : ''}Works fully offline</span>
        </footer>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} onPick={(h) => navigate(h.to)} />
    </div>
  )
}

function CommandPalette({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (h: Hit) => void }) {
  const [q, setQ] = useState('')
  const trimmed = q.trim()

  const hits = useMemo<Hit[]>(() => {
    if (trimmed.length < 1) return []
    const like = `%${trimmed}%`
    const out: Hit[] = []
    for (const r of query<{ id: string; order_no: string; customer_name: string }>(
      `SELECT id, order_no, customer_name FROM orders WHERE order_no LIKE ? OR customer_name LIKE ? LIMIT 6`,
      [like, like]
    ))
      out.push({ kind: 'Order', label: r.order_no, sub: r.customer_name, to: `/orders/${r.id}` })
    for (const r of query<{ id: string; name: string; phone: string }>(
      `SELECT id, name, phone FROM customers WHERE (name LIKE ? OR phone LIKE ?) AND archived_at IS NULL LIMIT 6`,
      [like, like]
    ))
      out.push({ kind: 'Customer', label: r.name, sub: r.phone, to: `/customers/${r.id}` })
    for (const r of query<{ id: string; name: string }>(`SELECT id, name FROM products WHERE name LIKE ? LIMIT 6`, [like]))
      out.push({ kind: 'Product', label: r.name, sub: '', to: `/products?edit=${r.id}` })
    for (const r of query<{ id: string; name: string }>(`SELECT id, name FROM recipes WHERE name LIKE ? LIMIT 6`, [like]))
      out.push({ kind: 'Recipe', label: r.name, sub: '', to: `/recipes/${r.id}` })
    for (const r of query<{ id: string; name: string; current_stock: number }>(
      `SELECT id, name, current_stock FROM ingredients WHERE name LIKE ? LIMIT 6`,
      [like]
    ))
      out.push({ kind: 'Ingredient', label: r.name, sub: `${r.current_stock} in stock`, to: `/inventory?edit=${r.id}` })
    return out
  }, [trimmed])

  useEffect(() => {
    if (open) setQ('')
  }, [open])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 no-print">
      <div className="fixed inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative w-full max-w-xl card shadow-pop overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-line">
          <Search size={16} className="text-muted" />
          <input
            autoFocus
            className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-muted"
            placeholder="Search everything…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button onClick={onClose} className="text-muted text-[11px] border border-line rounded px-1.5 py-0.5">
            Esc
          </button>
        </div>
        <div className="max-h-[46vh] overflow-y-auto">
          {trimmed === '' && (
            <div className="px-4 py-6 text-sm text-muted text-center">Start typing to search orders, customers, products, recipes and ingredients.</div>
          )}
          {trimmed !== '' && hits.length === 0 && <EmptyState title="No matches" description={`Nothing found for “${trimmed}”.`} />}
          {hits.map((h, i) => (
            <button
              key={i}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-pink-50 text-left border-b border-line last:border-0"
              onClick={() => {
                onPick(h)
                onClose()
              }}
            >
              <Badge tone="pink">{h.kind}</Badge>
              <span className="text-sm text-ink truncate">{h.label}</span>
              {h.sub && <span className="text-[12px] text-muted truncate ml-auto">{h.sub}</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export { STATUS_TONE }
