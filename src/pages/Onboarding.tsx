import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cake, PartyPopper, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react'
import { updateSettings, getSettings, DEFAULT_SETTINGS } from '../repositories/settings'
import { useApp } from '../store/app'
import { Field, TextInput, SelectInput, ErrorNote } from '../components/ui'

const CURRENCIES = [
  ['USD', '$'], ['EUR', '€'], ['GBP', '£'], ['PKR', '₨'], ['INR', '₹'], ['AED', 'د.إ'],
  ['SAR', '﷼'], ['TRY', '₺'], ['NGN', '₦'], ['ZAR', 'R'], ['BDT', '৳'], ['MYR', 'RM'],
  ['IDR', 'Rp'], ['PHP', '₱'], ['EGP', 'E£'], ['KES', 'KSh'], ['GHS', '₵'], ['XAF', 'FCFA'],
] as const

const BUSINESS_TYPES = [
  'Home bakery', 'Cottage food business', 'Custom cakes', 'Cookies', 'Cupcakes', 'Brownies & desserts',
  'Bread & pastries', 'Dessert shop', 'Small bakery', 'Other',
]

const STEPS = ['Your bakery', 'Money & units', 'How you work'] as const

export function OnboardingPage() {
  const nav = useNavigate()
  const boot = useApp((s) => s.boot)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    bakery_name: '',
    business_type: BUSINESS_TYPES[0],
    owner_name: '',
    currency: 'USD',
    currency_symbol: '$',
    currency_position: 'prefix' as 'prefix' | 'suffix',
    date_format: 'YYYY-MM-DD',
    measurement_system: 'metric',
    default_tax_rate: 0,
    default_labor_rate: 0,
    overhead_method: 'percent' as 'percent' | 'fixed',
    overhead_percent: 0,
    opening_days: 'Mon,Tue,Wed,Thu,Fri,Sat',
    default_lead_time_days: DEFAULT_SETTINGS.default_lead_time_days,
    low_stock_warnings: 1,
  })

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const finish = () => {
    if (!form.bakery_name.trim()) {
      setError('Please give your bakery a name — you can change it later.')
      return
    }
    try {
      const saved = updateSettings({
        ...form,
        onboarding_complete: 1,
        default_tax_rate: Number(form.default_tax_rate) || 0,
        default_labor_rate: Number(form.default_labor_rate) || 0,
        overhead_percent: Number(form.overhead_percent) || 0,
        default_lead_time_days: Number(form.default_lead_time_days) || 0,
      })
      boot(saved)
      nav('/', { replace: true })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const next = () => {
    setError('')
    if (step === 0 && !form.bakery_name.trim()) {
      setError('Please give your bakery a name — you can change it later.')
      return
    }
    if (step === 2) finish()
    else setStep((s) => s + 1)
  }

  return (
    <div className="min-h-screen bg-pale grid lg:grid-cols-2">
      {/* brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-10 sidebar-shell border-r border-white/10 overflow-hidden">
        <div className="pointer-events-none absolute inset-0 sidebar-sprinkles opacity-40" />
        <div className="pointer-events-none absolute -left-24 top-1/3 w-72 h-72 rounded-full bg-mint/15 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 w-64 h-64 rounded-full bg-butter/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#F8D98A] via-[#F1789E] to-[#C93E6B] shadow-[0_10px_24px_-10px_rgba(0,0,0,0.65)] ring-1 ring-white/30 grid place-items-center">
            <Cake size={20} className="text-white drop-shadow" />
          </div>
          <div>
            <p className="font-display text-lg leading-tight text-white">Ultimate Bakery Tracker</p>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#F9C9D8]/70 mt-0.5">Your entire bakery, offline</p>
          </div>
        </div>

        <div className="relative space-y-6 max-w-md">
          <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] font-semibold text-[#F8D98A]">
            <Sparkles size={13} /> Premium bakery workspace
          </span>
          <h1 className="font-display text-[40px] leading-[1.08] text-white">
            Customer → Order → Recipe → Production → Inventory → Profit.
          </h1>
          <p className="text-[13.5px] text-[#F3DDE5]/75 leading-relaxed">
            One warm, colourful workspace for the whole bakery — from the first quote to the last receipt.
          </p>
          <ul className="space-y-3 text-sm text-[#F8EDF1]">
            {[
              { text: 'Real recipe costing with packaging, labour and overhead', tint: 'from-[#9CE2C4] to-[#3FA372]' },
              { text: 'Production that consumes ingredients exactly once', tint: 'from-[#FBA3BE] to-[#C93E6B]' },
              { text: 'Auditable stock ledger — nothing changes silently', tint: 'from-[#F8D98A] to-[#E7A13B]' },
              { text: 'Orders, payments, expenses and reports that agree', tint: 'from-[#9ED2F2] to-[#2A6F9B]' },
              { text: 'Everything stored locally. No account, no cloud, no internet.', tint: 'from-[#C4B5FD] to-[#7B5CD6]' },
            ].map((t) => (
              <li key={t.text} className="flex gap-2.5 items-start">
                <span className={`w-5 h-5 rounded-full bg-gradient-to-br ${t.tint} text-white grid place-items-center shrink-0 mt-0.5 text-[11px] font-bold shadow-sm`}>
                  ✓
                </span>
                {t.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative flex items-end justify-between gap-4">
          <p className="text-xs text-[#F3DDE5]/55 max-w-[220px]">
            Takes about a minute. Every setting can be changed later in Settings.
          </p>
          <div className="pointer-events-none -mb-8 -mr-6 animate-floaty opacity-95">
            <OnboardingCupcake />
          </div>
        </div>
      </div>

      {/* form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-lg">
          {/* mobile brand */}
          <div className="lg:hidden flex items-center gap-2.5 mb-7">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#F8D98A] via-[#F1789E] to-[#C93E6B] grid place-items-center shadow-glow">
              <Cake size={19} className="text-white" />
            </div>
            <div>
              <p className="font-display text-[16px] leading-tight">Ultimate Bakery Tracker</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-muted">Your entire bakery, offline</p>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-7">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-1.5 rounded-full ${i <= step ? 'bg-gradient-to-r from-[#F1789E] to-[#C93E6B]' : 'bg-line'}`} />
                <p className={`text-[11px] mt-1.5 ${i === step ? 'text-ink font-semibold' : 'text-muted'}`}>{s}</p>
              </div>
            ))}
          </div>

          <div className="card p-6 relative overflow-hidden">
            <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#F4C95D] via-[#F1789E] to-[#C93E6B]" />
            {step === 0 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-1">
                  <Cake size={18} className="text-pink-500" />
                  <h2 className="font-display text-xl">Welcome — let’s set up your bakery</h2>
                </div>
                <Field label="Bakery name" required>
                  <TextInput
                    autoFocus
                    value={form.bakery_name}
                    onChange={(e) => set('bakery_name', e.target.value)}
                    placeholder="e.g. Sweet Bloom Bakery"
                  />
                </Field>
                <Field label="Business type">
                  <SelectInput value={form.business_type} onChange={(e) => set('business_type', e.target.value)}>
                    {BUSINESS_TYPES.map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Your name" hint="Optional — shown on printed order summaries.">
                  <TextInput value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} placeholder="Optional" />
                </Field>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl">Money and units</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Currency">
                    <SelectInput
                      value={form.currency}
                      onChange={(e) => {
                        const cur = CURRENCIES.find((c) => c[0] === e.target.value)
                        setForm((f) => ({ ...f, currency: e.target.value, currency_symbol: cur ? cur[1] : f.currency_symbol }))
                      }}
                    >
                      {CURRENCIES.map(([code, sym]) => (
                        <option key={code} value={code}>
                          {code} ({sym})
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Symbol position">
                    <SelectInput
                      value={form.currency_position}
                      onChange={(e) => set('currency_position', e.target.value as 'prefix' | 'suffix')}
                    >
                      <option value="prefix">Before amount ($12.00)</option>
                      <option value="suffix">After amount (12.00 $)</option>
                    </SelectInput>
                  </Field>
                </div>
                <Field label="Date format">
                  <SelectInput value={form.date_format} onChange={(e) => set('date_format', e.target.value)}>
                    <option value="YYYY-MM-DD">2026-03-09 (YYYY-MM-DD)</option>
                    <option value="DD/MM/YYYY">09/03/2026 (DD/MM/YYYY)</option>
                    <option value="MM/DD/YYYY">03/09/2026 (MM/DD/YYYY)</option>
                    <option value="MMM D, YYYY">Mar 9, 2026</option>
                  </SelectInput>
                </Field>
                <Field label="Measurement system">
                  <SelectInput value={form.measurement_system} onChange={(e) => set('measurement_system', e.target.value)}>
                    <option value="metric">Metric (g, kg, ml, L)</option>
                    <option value="imperial">Imperial (oz, lb, cup)</option>
                  </SelectInput>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Default tax rate %" hint="Leave 0 if you don’t charge tax.">
                    <TextInput
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.default_tax_rate}
                      onChange={(e) => set('default_tax_rate', Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Labour cost per hour" hint="Used in recipe costing.">
                    <TextInput
                      type="number"
                      min={0}
                      step="0.01"
                      value={form.default_labor_rate}
                      onChange={(e) => set('default_labor_rate', Number(e.target.value))}
                    />
                  </Field>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <h2 className="font-display text-xl">How you work</h2>
                <Field label="Opening days">
                  <div className="flex flex-wrap gap-1.5">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => {
                      const active = form.opening_days.split(',').includes(d)
                      return (
                        <button
                          key={d}
                          type="button"
                          className={`h-9 px-3 rounded-xl text-[13px] border transition ${
                            active
                              ? 'bg-gradient-to-r from-[#F1789E] to-[#C93E6B] text-white border-transparent shadow-sm'
                              : 'bg-white text-muted border-line hover:border-pink-300'
                          }`}
                          onClick={() =>
                            set(
                              'opening_days',
                              active
                                ? form.opening_days
                                    .split(',')
                                    .filter((x) => x !== d)
                                    .join(',')
                                : [...form.opening_days.split(',').filter(Boolean), d].join(',')
                            )
                          }
                        >
                          {d}
                        </button>
                      )
                    })}
                  </div>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Default order lead time (days)">
                    <TextInput
                      type="number"
                      min={0}
                      value={form.default_lead_time_days}
                      onChange={(e) => set('default_lead_time_days', Number(e.target.value))}
                    />
                  </Field>
                  <Field label="Overhead method">
                    <SelectInput
                      value={form.overhead_method}
                      onChange={(e) => set('overhead_method', e.target.value as 'percent' | 'fixed')}
                    >
                      <option value="percent">Percentage of costs</option>
                      <option value="fixed">Fixed amount per batch</option>
                    </SelectInput>
                  </Field>
                </div>
                <Field label={form.overhead_method === 'percent' ? 'Overhead %' : 'Overhead per batch'}>
                  <TextInput
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.overhead_method === 'percent' ? form.overhead_percent : 0}
                    disabled={form.overhead_method !== 'percent'}
                    onChange={(e) => set('overhead_percent', Number(e.target.value))}
                  />
                </Field>
                <label className="flex items-start gap-2.5 text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#E35683]"
                    checked={form.low_stock_warnings === 1}
                    onChange={(e) => set('low_stock_warnings', e.target.checked ? 1 : 0)}
                  />
                  <span>
                    Warn me about low stock
                    <span className="block text-[11.5px] text-muted">Ingredients at or below their minimum level will be flagged.</span>
                  </span>
                </label>
              </div>
            )}

            {error && <div className="mt-4">{<ErrorNote>{error}</ErrorNote>}</div>}

            <div className="flex items-center justify-between mt-6">
              <button
                className="btn-ghost"
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                disabled={step === 0}
              >
                <ArrowLeft size={15} /> Back
              </button>
              <div className="flex items-center gap-2">
                {step > 0 && (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      if (step === 2) {
                        updateSettings({ ...form, onboarding_complete: 1 })
                        const s = getBootSettings()
                        boot(s)
                        nav('/', { replace: true })
                      } else setStep((s) => s + 1)
                    }}
                  >
                    Skip
                  </button>
                )}
                <button className="btn-primary" onClick={next}>
                  {step === 2 ? (
                    <>
                      <PartyPopper size={15} /> Open my bakery
                    </>
                  ) : (
                    <>
                      Continue <ArrowRight size={15} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          <p className="text-[11.5px] text-muted mt-4 text-center">Fully offline · no account · your data stays on this device</p>
        </div>
      </div>
    </div>
  )
}

function OnboardingCupcake() {
  return (
    <svg width="170" height="170" viewBox="0 0 210 210" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="ubt-onb-wrapper" x1="58" y1="122" x2="152" y2="192" gradientUnits="userSpaceOnUse">
          <stop stopColor="#F8D98A" />
          <stop offset="1" stopColor="#F59E6B" />
        </linearGradient>
        <linearGradient id="ubt-onb-frosting" x1="58" y1="56" x2="152" y2="130" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFFBF5" />
          <stop offset="1" stopColor="#FFDDE8" />
        </linearGradient>
      </defs>
      <ellipse cx="105" cy="196" rx="62" ry="9" fill="#2A0F19" opacity="0.35" />
      <path d="M58 124h94l-11 56c-1.4 7-7.3 12-14.4 12H83.4c-7.1 0-13-5-14.4-12l-11-56Z" fill="url(#ubt-onb-wrapper)" />
      <path d="M74 132l-6 46M98 132v50M122 132v50M146 132l6 46" stroke="#D9783F" strokeWidth="3.5" strokeLinecap="round" opacity="0.5" />
      <path
        d="M63 126c-2.8-11 4.8-20 15.6-20 3.2-11.5 16.4-17 25-9.4 8.6-7.6 21.8-2.1 25 9.4 10.8 0 18.4 9 15.6 20H63Z"
        fill="url(#ubt-onb-frosting)"
      />
      <path d="M67 104c6-11 17-16 30-14M87 92c3-8 10-12 19-11M117 87c7-2 14 1 19 8" stroke="#F6B7C9" strokeWidth="3" strokeLinecap="round" opacity="0.9" />
      <circle cx="105" cy="72" r="9.5" fill="#D9536B" />
      <path d="M105 63c2.5-8 9-12.5 17-12.5" stroke="#3B2230" strokeWidth="3.2" strokeLinecap="round" />
      <g strokeLinecap="round" strokeWidth="3">
        <path d="M80 116l4-7" stroke="#58C99A" />
        <path d="M95 124l3-6" stroke="#62B4E8" />
        <path d="M113 117l-3-7" stroke="#F4C95D" />
        <path d="M130 122l4-6" stroke="#A78BFA" />
        <path d="M139 108l3-6" stroke="#F59E6B" />
      </g>
    </svg>
  )
}

function getBootSettings() {
  return getSettings()
}
