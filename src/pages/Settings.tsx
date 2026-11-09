import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Save, Database, Download, Upload, RefreshCw, FlaskConical, Trash2, Plus, Ruler, Store, AlertTriangle,
} from 'lucide-react'
import {
  PageHeader, Card, Grid, Field, TextInput, SelectInput, Badge, TableWrap, THead, Confirm, ErrorNote, SuccessNote,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import {
  getSettings, updateSettings, listUnitConversions, addUnitConversion, removeUnitConversion,
} from '../repositories/settings'
import {
  downloadBackup, restoreBackupFile, currentDbSize, lastBackup, listBackups, removeSampleData, sampleDataExists,
} from '../repositories/backup'
import { seedSampleData } from '../repositories/sampleData'
import { resetDatabase } from '../db/database'
import type { Settings } from '../types'
import { formatDisplayDate } from '../lib/dates'
import { formatMoney, getDateFormat } from '../lib/format'

const CURRENCIES: [string, string][] = [
  ['USD', '$'], ['EUR', '€'], ['GBP', '£'], ['PKR', '₨'], ['AED', 'د.إ'], ['SAR', '﷼'],
  ['INR', '₹'], ['TRY', '₺'], ['NGN', '₦'], ['BDT', '৳'], ['MYR', 'RM'], ['IDR', 'Rp'],
]

const DATE_FORMATS = ['YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY', 'DD-MM-YYYY', 'YYYY/MM/DD']
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}

export function SettingsPage() {
  const toast = useApp((s) => s.toast)
  const setSettings = useApp((s) => s.setSettings)
  const nav = useNavigate()

  const [form, setForm] = useState<Settings>(() => getSettings())
  const [savedFlash, setSavedFlash] = useState(false)
  const [error, setError] = useState('')

  const conversions = useLive(() => listUnitConversions(), [])
  const backups = useLive(() => listBackups(), [])
  const lastBak = useLive(() => lastBackup(), [])
  const hasSample = useLive(() => sampleDataExists(), [])

  const [conv, setConv] = useState({ from: '', to: '', factor: '' })
  const [restoreMsg, setRestoreMsg] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmSample, setConfirmSample] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm((f) => ({ ...f, [k]: v }))

  useEffect(() => {
    setForm(getSettings())
  }, [])

  const save = () => {
    try {
      const saved = updateSettings({
        bakery_name: form.bakery_name.trim(),
        business_type: form.business_type,
        owner_name: form.owner_name,
        currency: form.currency,
        currency_symbol: form.currency_symbol,
        currency_position: form.currency_position,
        date_format: form.date_format,
        measurement_system: form.measurement_system,
        default_tax_rate: Number(form.default_tax_rate) || 0,
        default_labor_rate: Number(form.default_labor_rate) || 0,
        labor_unit: form.labor_unit,
        overhead_method: form.overhead_method,
        overhead_percent: Number(form.overhead_percent) || 0,
        overhead_fixed: Number(form.overhead_fixed) || 0,
        opening_days: form.opening_days,
        default_lead_time_days: Number(form.default_lead_time_days) || 0,
        low_stock_warnings: Number(form.low_stock_warnings),
        expiry_warning_days: Number(form.expiry_warning_days) || 7,
        allow_negative_stock: Number(form.allow_negative_stock),
        auto_order_no: Number(form.auto_order_no),
      })
      setForm(saved)
      setSettings(saved)
      setError('')
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
      toast('success', 'Settings saved')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const toggleDay = (d: string) => {
    const days = form.opening_days ? form.opening_days.split(',').filter(Boolean) : []
    const next = days.includes(d) ? days.filter((x) => x !== d) : [...days, d]
    set('opening_days', WEEKDAYS.filter((w) => next.includes(w)).join(','))
  }

  const doBackup = () => {
    const info = downloadBackup('manual')
    toast('success', 'Backup downloaded', formatBytes(info.size_bytes))
  }

  const doRestore = async (file: File) => {
    setRestoreMsg('')
    try {
      await restoreBackupFile(file)
      setRestoreMsg(`Restored from ${file.name}. All data now comes from that backup.`)
      toast('success', 'Backup restored')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setRestoreMsg('')
      toast('error', 'Restore failed', msg)
    }
  }

  const doSeedSample = () => {
    try {
      const r = seedSampleData()
      toast(r.created ? 'success' : 'info', r.created ? 'Sample data added' : 'Sample data already present')
    } catch (e) {
      toast('error', 'Could not add sample data', e instanceof Error ? e.message : String(e))
    }
  }

  const doRemoveSample = () => {
    const removed = removeSampleData()
    toast('success', 'Sample data removed', `${removed} rows deleted`)
    setConfirmSample(false)
  }

  const doReset = async () => {
    setResetBusy(true)
    try {
      await resetDatabase()
      window.location.assign('#/welcome')
      window.location.reload()
    } catch (e) {
      toast('error', 'Reset failed', e instanceof Error ? e.message : String(e))
      setResetBusy(false)
      setConfirmReset(false)
    }
  }

  const redoOnboarding = () => {
    const saved = updateSettings({ onboarding_complete: 0 })
    setSettings(saved)
    nav('/welcome', { replace: true })
  }

  return (
    <>
      <PageHeader
        title="Settings & Backup"
        subtitle="Everything here is stored on this device only"
        actions={
          <>
            {savedFlash && <SuccessNote>Saved</SuccessNote>}
            <button className="btn-primary" onClick={save}><Save size={15} /> Save changes</button>
          </>
        }
      />

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="grid xl:grid-cols-2 gap-5 items-start">
        {/* ------------------------------ Profile ------------------------------ */}
        <Card title="Bakery profile" className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-pink-400 text-white grid place-items-center font-display text-xl">
              {(form.bakery_name || 'B').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-medium">{form.bakery_name || 'Your bakery'}</p>
              <p className="text-[12.5px] text-muted">{form.business_type || 'Business type not set'}</p>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Bakery name" required>
              <TextInput value={form.bakery_name} onChange={(e) => set('bakery_name', e.target.value)} />
            </Field>
            <Field label="Owner name">
              <TextInput value={form.owner_name} onChange={(e) => set('owner_name', e.target.value)} />
            </Field>
            <Field label="Business type" className="sm:col-span-2">
              <SelectInput value={form.business_type} onChange={(e) => set('business_type', e.target.value)}>
                {['', 'Home bakery', 'Retail bakery', 'Cake studio', 'Bakery café', 'Wholesale bakery', 'Cloud bakery', 'Other'].map((t) => (
                  <option key={t} value={t}>{t || 'Select…'}</option>
                ))}
              </SelectInput>
            </Field>
          </div>
          <div className="mt-3">
            <button className="btn-ghost !h-8 text-[12.5px]" onClick={redoOnboarding}>
              <RefreshCw size={13} /> Run setup guide again
            </button>
          </div>
        </Card>

        {/* --------------------------- Money & format -------------------------- */}
        <Card title="Currency & formats" className="p-5">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Currency">
              <SelectInput
                value={form.currency}
                onChange={(e) => {
                  const code = e.target.value
                  const sym = CURRENCIES.find(([c]) => c === code)?.[1] ?? form.currency_symbol
                  setForm((f) => ({ ...f, currency: code, currency_symbol: sym }))
                }}
              >
                {CURRENCIES.map(([code, sym]) => (
                  <option key={code} value={code}>{code} ({sym})</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Symbol position">
              <SelectInput value={form.currency_position} onChange={(e) => set('currency_position', e.target.value as 'prefix' | 'suffix')}>
                <option value="prefix">Prefix — {form.currency_symbol}123</option>
                <option value="suffix">Suffix — 123 {form.currency_symbol}</option>
              </SelectInput>
            </Field>
            <Field label="Date format" hint={`Preview: ${formatDisplayDate(new Date().toISOString().slice(0, 10), form.date_format)}`}>
              <SelectInput value={form.date_format} onChange={(e) => set('date_format', e.target.value)}>
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Measurement system">
              <SelectInput value={form.measurement_system} onChange={(e) => set('measurement_system', e.target.value)}>
                <option value="metric">Metric — g, kg, ml, l</option>
                <option value="imperial">Imperial — oz, lb, fl oz</option>
              </SelectInput>
            </Field>
          </div>
        </Card>

        {/* --------------------------- Cost defaults --------------------------- */}
        <Card title="Costing defaults" className="p-5">
          <p className="text-[12.5px] text-muted mb-3.5 leading-relaxed">
            Used when calculating recipe costs and estimated order profitability. Nothing is applied automatically to
            your saved prices.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Default tax rate %" hint="Applied as a default on new orders">
              <TextInput type="number" min={0} step="0.1" className="tnum" value={form.default_tax_rate || ''} onChange={(e) => set('default_tax_rate', Number(e.target.value))} />
            </Field>
            <Field label="Labor rate" hint={`Per ${form.labor_unit}`}>
              <TextInput type="number" min={0} step="0.01" className="tnum" value={form.default_labor_rate || ''} onChange={(e) => set('default_labor_rate', Number(e.target.value))} />
            </Field>
            <Field label="Labor unit">
              <SelectInput value={form.labor_unit} onChange={(e) => set('labor_unit', e.target.value as 'hour' | 'minute')}>
                <option value="hour">Per hour</option>
                <option value="minute">Per minute</option>
              </SelectInput>
            </Field>
            <Field label="Overhead method">
              <SelectInput value={form.overhead_method} onChange={(e) => set('overhead_method', e.target.value as 'percent' | 'fixed')}>
                <option value="percent">Percentage of cost</option>
                <option value="fixed">Fixed amount per batch</option>
              </SelectInput>
            </Field>
            {form.overhead_method === 'percent' ? (
              <Field label="Overhead %">
                <TextInput type="number" min={0} step="0.1" className="tnum" value={form.overhead_percent || ''} onChange={(e) => set('overhead_percent', Number(e.target.value))} />
              </Field>
            ) : (
              <Field label="Overhead fixed amount">
                <TextInput type="number" min={0} step="0.01" className="tnum" value={form.overhead_fixed || ''} onChange={(e) => set('overhead_fixed', Number(e.target.value))} />
              </Field>
            )}
          </div>
          <div className="mt-3 text-[12.5px] text-muted">
            Preview: 1 unit of labor = <b className="text-ink tnum">{formatMoney(form.default_labor_rate)}</b>
            {' · '}overhead = <b className="text-ink tnum">{form.overhead_method === 'percent' ? `${form.overhead_percent || 0}%` : formatMoney(form.overhead_fixed || 0)}</b>
          </div>
        </Card>

        {/* ---------------------------- Operations ----------------------------- */}
        <Card title="Operations" className="p-5">
          <Field label="Opening days" className="mb-4">
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d) => {
                const active = form.opening_days.split(',').includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => toggleDay(d)}
                    className={`h-9 px-3.5 rounded-xl text-[13px] font-medium border transition ${
                      active ? 'bg-pink-400 border-pink-400 text-white' : 'bg-white border-line text-muted hover:text-ink'
                    }`}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </Field>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Default lead time (days)" hint="Suggested delivery window for new orders">
              <TextInput type="number" min={0} className="tnum" value={form.default_lead_time_days || ''} onChange={(e) => set('default_lead_time_days', Number(e.target.value))} />
            </Field>
            <Field label="Expiry warning (days)" hint="Ingredients flagged this many days before expiry">
              <TextInput type="number" min={1} className="tnum" value={form.expiry_warning_days || ''} onChange={(e) => set('expiry_warning_days', Number(e.target.value))} />
            </Field>
          </div>
          <div className="mt-4 divide-y divide-line border-t border-line">
            <ToggleRow
              label="Low stock warnings"
              description="Show an alert when an ingredient drops below its reorder level"
              checked={!!form.low_stock_warnings}
              onChange={(v) => set('low_stock_warnings', v ? 1 : 0)}
            />
            <ToggleRow
              label="Allow negative stock"
              description="Off by default — the ledger will block consumption that would go below zero"
              checked={!!form.allow_negative_stock}
              onChange={(v) => set('allow_negative_stock', v ? 1 : 0)}
            />
            <ToggleRow
              label="Automatic order numbers"
              description="Generate the next order number when creating an order"
              checked={!!form.auto_order_no}
              onChange={(v) => set('auto_order_no', v ? 1 : 0)}
            />
          </div>
        </Card>

        {/* -------------------------- Unit conversions ------------------------- */}
        <Card title="Unit conversions" className="p-5" action={<Ruler size={15} className="text-muted" />}>
          <p className="text-[12.5px] text-muted mb-3.5 leading-relaxed">
            Lets recipes written in one unit consume stock kept in another. Example: 1 lb = 0.453592 kg.
          </p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end mb-3">
            <Field label="From unit">
              <TextInput value={conv.from} onChange={(e) => setConv((c) => ({ ...c, from: e.target.value }))} placeholder="lb" />
            </Field>
            <Field label="To unit">
              <TextInput value={conv.to} onChange={(e) => setConv((c) => ({ ...c, to: e.target.value }))} placeholder="kg" />
            </Field>
            <button
              className="btn-secondary !h-10"
              onClick={() => {
                const factor = Number(conv.factor)
                if (!conv.from.trim() || !conv.to.trim() || !factor) {
                  toast('error', 'Enter both units and a factor')
                  return
                }
                addUnitConversion(conv.from.trim().toLowerCase(), conv.to.trim().toLowerCase(), factor)
                setConv({ from: '', to: '', factor: '' })
                toast('success', 'Conversion added')
              }}
            >
              <Plus size={15} /> Add
            </button>
          </div>
          <Field label="Factor" hint="1 'from unit' equals this many 'to units'">
            <TextInput type="number" step="any" min={0} className="tnum" value={conv.factor} onChange={(e) => setConv((c) => ({ ...c, factor: e.target.value }))} placeholder="0.453592" />
          </Field>

          <div className="mt-4">
            {conversions.length === 0 ? (
              <p className="text-[12.5px] text-muted">No custom conversions yet.</p>
            ) : (
              <TableWrap className="!min-w-0">
                <THead cols={['From', 'To', 'Factor', '']} />
                <tbody className="divide-y divide-line">
                  {conversions.map((c) => (
                    <tr key={c.id}>
                      <td className="td !py-2">{c.from_unit}</td>
                      <td className="td !py-2">{c.to_unit}</td>
                      <td className="td !py-2 tnum">{c.factor}</td>
                      <td className="td !py-2 text-right">
                        <button className="btn-ghost !h-7 !px-2" onClick={() => removeUnitConversion(c.id)}>
                          <Trash2 size={14} className="text-bad" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </div>
        </Card>

        {/* ------------------------------ Backup ------------------------------- */}
        <Card title="Backup & restore" className="p-5" action={<Database size={15} className="text-muted" />}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl bg-warm px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Database size</p>
              <p className="text-[15px] font-semibold tnum mt-0.5">{formatBytes(currentDbSize())}</p>
            </div>
            <div className="rounded-xl bg-warm px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Last backup</p>
              <p className="text-[15px] font-semibold tnum mt-0.5">{lastBak ? formatDisplayDate(lastBak.created_at.slice(0, 10), getDateFormat()) : 'Never'}</p>
            </div>
            <div className="rounded-xl bg-warm px-3 py-2.5">
              <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">Backups made</p>
              <p className="text-[15px] font-semibold tnum mt-0.5">{backups.length}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={doBackup}><Download size={15} /> Download backup</button>
            <button className="btn-secondary" onClick={() => fileRef.current?.click()}><Upload size={15} /> Restore from file</button>
            <input
              ref={fileRef}
              type="file"
              accept=".ubt,application/octet-stream"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void doRestore(f)
                e.target.value = ''
              }}
            />
          </div>
          {restoreMsg && <div className="mt-3"><SuccessNote>{restoreMsg}</SuccessNote></div>}

          <p className="hint mt-3">
            Restoring replaces <b>everything</b> currently in the app with the contents of the backup file. Download a
            backup first if you might want to go back.
          </p>

          {backups.length > 0 && (
            <div className="mt-4 border-t border-line pt-3">
              <p className="label !mb-2">Recent backup activity</p>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {backups.slice(0, 8).map((b) => (
                  <div key={b.id} className="flex justify-between text-[12.5px]">
                    <span className="text-muted">{formatDisplayDate(b.created_at.slice(0, 10), getDateFormat())} {b.created_at.slice(11, 16)}</span>
                    <span className="tnum">{formatBytes(b.size_bytes)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* ---------------------------- Sample data ---------------------------- */}
        <Card title="Sample data" className="p-5" action={<FlaskConical size={15} className="text-muted" />}>
          <p className="text-[12.5px] text-muted leading-relaxed mb-3">
            Sample records are tagged so they can be removed in one tap without ever touching your real data. Use them
            to explore the app before entering your own bakery.
          </p>
          {hasSample ? (
            <SuccessNote>Sample data is present in this database.</SuccessNote>
          ) : (
            <div className="rounded-xl bg-warm text-[12.5px] text-muted px-4 py-3">No sample data found.</div>
          )}
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn-secondary" onClick={doSeedSample}><Plus size={15} /> Add sample data</button>
            <button className="btn-secondary" onClick={() => setConfirmSample(true)} disabled={!hasSample}>
              <Trash2 size={15} /> Remove sample data
            </button>
          </div>
        </Card>

        {/* ---------------------------- Danger zone ---------------------------- */}
        <Card title="Danger zone" className="p-5 border !border-[#F3C9CD]" action={<AlertTriangle size={15} className="text-bad" />}>
          <p className="text-[12.5px] text-muted leading-relaxed mb-3">
            Resetting erases every order, customer, recipe, ingredient and setting from this device and starts the app
            fresh. This cannot be undone unless you have a backup file.
          </p>
          <button className="btn-danger" onClick={() => setConfirmReset(true)} disabled={resetBusy}>
            <Trash2 size={15} /> Erase all data
          </button>
        </Card>
      </div>

      <Grid cols={3} className="mt-5 mb-8">
        <div className="rounded-xl bg-warm px-4 py-3 text-[12.5px] text-muted leading-relaxed">
          <b className="text-ink"><Store size={13} className="inline -mt-0.5 mr-1" />Offline by design.</b> No account, no
          server, no analytics — your data lives in this browser.
        </div>
        <div className="rounded-xl bg-warm px-4 py-3 text-[12.5px] text-muted leading-relaxed">
          <b className="text-ink">Date format in use:</b> {getDateFormat()}
        </div>
        <div className="rounded-xl bg-warm px-4 py-3 text-[12.5px] text-muted leading-relaxed">
          <b className="text-ink">Manual save.</b> Press “Save changes” after editing settings above.
        </div>
      </Grid>

      <Confirm
        open={confirmSample}
        title="Remove sample data?"
        message="Only rows tagged as sample will be deleted — customers, orders and products you created yourself are untouched. Stock levels are recalculated from the remaining ledger."
        confirmLabel="Remove samples"
        danger
        onConfirm={doRemoveSample}
        onCancel={() => setConfirmSample(false)}
      />
      <Confirm
        open={confirmReset}
        title="Erase all data?"
        message={
          <>
            This deletes everything in the app — orders, customers, recipes, inventory, finances and settings. Consider
            downloading a backup first.
          </>
        }
        confirmLabel="Erase everything"
        danger
        busy={resetBusy}
        onConfirm={() => void doReset()}
        onCancel={() => setConfirmReset(false)}
      />
    </>
  )
}

function ToggleRow({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4 py-3 cursor-pointer group">
      <span>
        <span className="block text-[13.5px] font-medium group-hover:text-pink-700 transition">{label}</span>
        <span className="block text-[12px] text-muted mt-0.5">{description}</span>
      </span>
      <span className="relative inline-flex shrink-0 mt-0.5">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="w-10 h-6 rounded-full bg-line peer-checked:bg-pink-400 transition-colors" />
        <span className="absolute left-0.5 top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform peer-checked:translate-x-4" />
      </span>
    </label>
  )
}
