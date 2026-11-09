import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Cake, PartyPopper, ArrowRight, ArrowLeft } from 'lucide-react'
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
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-b from-pink-100 to-pale border-r border-line">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-pink-400 text-white grid place-items-center font-display text-xl">B</div>
          <div>
            <p className="font-display text-lg leading-tight">Ultimate Bakery Tracker</p>
            <p className="text-xs text-muted">Your entire bakery. One beautiful offline workspace.</p>
          </div>
        </div>

        <div className="space-y-6">
          <h1 className="font-display text-4xl leading-tight text-ink">
            Customer → Order → Recipe → Production → Inventory → Profit.
          </h1>
          <ul className="space-y-3 text-sm text-ink">
            {[
              'Real recipe costing with packaging, labour and overhead',
              'Production that consumes ingredients exactly once',
              'Auditable stock ledger — nothing changes silently',
              'Orders, payments, expenses and reports that agree with each other',
              'Everything stored locally. No account, no cloud, no internet.',
            ].map((t) => (
              <li key={t} className="flex gap-2.5 items-start">
                <span className="w-5 h-5 rounded-full bg-white text-pink-600 grid place-items-center shrink-0 mt-0.5 text-[11px] font-semibold">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted">
          Takes about a minute. Every setting can be changed later in Settings.
        </p>
      </div>

      {/* form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-lg">
          <div className="flex items-center gap-2 mb-7">
            {STEPS.map((s, i) => (
              <div key={s} className="flex-1">
                <div className={`h-1 rounded-full ${i <= step ? 'bg-pink-400' : 'bg-line'}`} />
                <p className={`text-[11px] mt-1.5 ${i === step ? 'text-ink font-medium' : 'text-muted'}`}>{s}</p>
              </div>
            ))}
          </div>

          <div className="card p-6">
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
                            active ? 'bg-pink-400 text-white border-pink-400' : 'bg-white text-muted border-line hover:border-pink-300'
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
                    className="mt-0.5 accent-[#E8A3BA]"
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

function getBootSettings() {
  return getSettings()
}
