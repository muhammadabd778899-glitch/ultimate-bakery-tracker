import { useState } from 'react'
import { Plus, Trash2, FileDown, AlertTriangle } from 'lucide-react'
import {
  PageHeader, Card, Grid, SearchInput, Badge, EmptyState, Modal, Field, TextInput, SelectInput, TextArea, TableWrap,
  THead, Confirm, ErrorNote,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import { listWaste, recordWaste, deleteWaste, listIngredients } from '../repositories/inventory'
import { wasteReport, defaultRange } from '../repositories/reports'
import { formatDisplayDate, todayKey, addDays } from '../lib/dates'
import { formatMoney, getDateFormat } from '../lib/format'
import { exportCsv } from '../lib/exporters'

const CATEGORIES = ['Failed batch', 'Overproduction', 'Damaged product', 'Customer return', 'Expired stock', 'Ingredient spoilage', 'Other']

export function WastePage() {
  const toast = useApp((s) => s.toast)
  const [from, setFrom] = useState(addDays(todayKey(), -90))
  const [to, setTo] = useState(todayKey())
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [toDelete, setToDelete] = useState<string | null>(null)

  const rows = useLive(() => listWaste(from, to).filter((w) => !search || `${w.ingredient_name} ${w.product_name} ${w.reason} ${w.category}`.toLowerCase().includes(search.toLowerCase())), [from, to, search])
  const report = useLive(() => wasteReport(from, to), [from, to])

  const doExport = () => {
    exportCsv(
      'waste.csv',
      ['Date', 'Type', 'Item', 'Quantity', 'Unit', 'Category', 'Reason', 'Value', 'Notes'],
      rows.map((w) => [w.waste_date, w.waste_type, w.ingredient_name || w.product_name, w.quantity, w.unit, w.category, w.reason, w.value, w.notes])
    )
    toast('success', 'Waste exported')
  }

  return (
    <>
      <PageHeader
        title="Waste & Spoilage"
        subtitle="Every wasted unit is accounted for — with its reason and estimated cost"
        actions={
          <>
            <button className="btn-secondary" onClick={doExport}>
              <FileDown size={15} /> CSV
            </button>
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus size={15} /> Record waste
            </button>
          </>
        }
      />

      <Grid cols={4} className="mb-5">
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Waste records</p>
          <p className="mt-1.5 text-[21px] font-semibold tnum">{report.count}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Estimated cost lost</p>
          <p className={`mt-1.5 text-[21px] font-semibold tnum ${report.totalValue > 0 ? 'text-bad' : 'text-ink'}`}>{formatMoney(report.totalValue)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Total quantity</p>
          <p className="mt-1.5 text-[21px] font-semibold tnum">{report.totalQuantity}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Top reason</p>
          <p className="mt-1.5 text-[15px] font-medium truncate">{report.byReason[0]?.reason ?? '—'}</p>
        </Card>
      </Grid>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <Card title="By category" className="lg:col-span-1 p-5">
          {report.byCategory.length === 0 ? (
            <EmptyState title="No waste recorded" description="Waste you record appears broken down here." icon={<AlertTriangle size={24} />} />
          ) : (
            <ul className="space-y-2.5">
              {report.byCategory.map((c) => (
                <li key={c.category} className="text-[13px]">
                  <div className="flex justify-between">
                    <span className="text-muted">{c.category}</span>
                    <span className="tnum font-medium">{formatMoney(c.value)}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-pink-100 mt-1.5 overflow-hidden">
                    <div
                      className="h-full bg-pink-400 rounded-full"
                      style={{ width: `${Math.min(100, report.totalValue > 0 ? (c.value / report.totalValue) * 100 : 0)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="By month" className="p-5">
          {report.byMonth.length === 0 ? (
            <EmptyState title="Nothing yet" description="Monthly waste value appears here." />
          ) : (
            <ul className="space-y-2">
              {report.byMonth.map((m) => (
                <li key={m.month} className="flex justify-between text-[13px]">
                  <span className="text-muted tnum">{m.month}</span>
                  <span className="tnum font-medium">{formatMoney(m.value)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Repeated reasons" className="p-5">
          {report.byReason.length === 0 ? (
            <EmptyState title="No patterns yet" description="Reasons that keep showing up are listed here so you can fix the cause." />
          ) : (
            <ul className="space-y-2">
              {report.byReason.slice(0, 8).map((r) => (
                <li key={r.reason} className="flex justify-between text-[13px]">
                  <span className="text-muted truncate pr-3">{r.reason}</span>
                  <span className="tnum font-medium shrink-0">{r.count}×</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

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
          <SearchInput value={search} onChange={setSearch} placeholder="Search waste…" className="w-full sm:w-64" />
        </div>
      </Card>

      <Card className="p-0">
        {rows.length === 0 ? (
          <EmptyState title="No waste in this period" description="Record failed batches, spoilage or damaged products here." icon={<AlertTriangle size={26} />} />
        ) : (
          <TableWrap>
            <THead cols={['Date', 'Type', 'Item', 'Quantity', 'Category', 'Reason', 'Value', 'Stock deducted', '']} />
            <tbody className="divide-y divide-line">
              {rows.map((w) => (
                <tr key={w.id} className="hover:bg-pale">
                  <td className="td tnum text-[12.5px]">{formatDisplayDate(w.waste_date, getDateFormat())}</td>
                  <td className="td"><Badge tone="neutral">{w.waste_type}</Badge></td>
                  <td className="td font-medium">{w.ingredient_name || w.product_name || '—'}</td>
                  <td className="td tnum">{w.quantity} {w.unit}</td>
                  <td className="td text-muted text-[12.5px]">{w.category}</td>
                  <td className="td text-[12.5px]">{w.reason}</td>
                  <td className="td tnum font-medium text-bad">{formatMoney(w.value)}</td>
                  <td className="td">{w.movement_created ? <Badge tone="success">yes</Badge> : <Badge tone="neutral">no</Badge>}</td>
                  <td className="td text-right no-print">
                    <button className="btn-ghost !h-8 !px-2" onClick={() => setToDelete(w.id)} title="Delete (restores stock if deducted)">
                      <Trash2 size={15} className="text-bad" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <WasteForm open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); toast('success', 'Waste recorded') }} />

      <Confirm
        open={!!toDelete}
        title="Delete this waste record?"
        message="If stock was deducted when it was created, the quantity is returned to inventory with a correction entry so nothing is lost or double-counted."
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          try {
            if (toDelete) deleteWaste(toDelete)
            toast('success', 'Waste record deleted')
          } catch (e) {
            toast('error', 'Could not delete', e instanceof Error ? e.message : String(e))
          } finally {
            setToDelete(null)
          }
        }}
        onCancel={() => setToDelete(null)}
      />
    </>
  )
}

function WasteForm({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const toast = useApp((s) => s.toast)
  const ingredients = useLive(() => (open ? listIngredients() : []), [open])
  const [form, setForm] = useState({
    waste_date: todayKey(),
    waste_type: 'ingredient',
    ingredient_id: '',
    product_name: '',
    quantity: 1,
    category: 'Expired stock',
    reason: '',
    value: 0,
    notes: '',
    deduct_stock: true,
  })
  const [error, setError] = useState('')

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))
  const ing = ingredients.find((i) => i.id === form.ingredient_id)

  const submit = () => {
    setError('')
    if (!form.reason.trim()) {
      setError('A reason is required — every stock change must be traceable.')
      return
    }
    if (form.waste_type === 'ingredient' && !form.ingredient_id) {
      setError('Choose the ingredient that was wasted.')
      return
    }
    if (form.waste_type === 'product' && !form.product_name.trim()) {
      setError('Enter which product was wasted.')
      return
    }
    try {
      recordWaste({
        waste_date: form.waste_date,
        waste_type: form.waste_type as 'ingredient' | 'product',
        ingredient_id: form.waste_type === 'ingredient' ? form.ingredient_id || null : null,
        batch_id: null,
        product_name: form.waste_type === 'product' ? form.product_name : '',
        quantity: Number(form.quantity),
        unit: ing?.purchase_unit ?? 'pcs',
        category: form.category,
        reason: form.reason,
        value: Number(form.value) || 0,
        notes: form.notes,
        deduct_stock: form.deduct_stock,
      })
      onSaved()
      setForm((f) => ({ ...f, reason: '', quantity: 1, value: 0, notes: '' }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      toast('error', 'Could not record waste', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record waste"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Save waste</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" value={form.waste_date} onChange={(e) => set('waste_date', e.target.value)} />
          </Field>
          <Field label="What was wasted?">
            <SelectInput value={form.waste_type} onChange={(e) => set('waste_type', e.target.value)}>
              <option value="ingredient">An ingredient / stock</option>
              <option value="product">A finished product</option>
            </SelectInput>
          </Field>
        </div>

        {form.waste_type === 'ingredient' ? (
          <Field label="Ingredient" required>
            <SelectInput value={form.ingredient_id} onChange={(e) => set('ingredient_id', e.target.value)}>
              <option value="">Choose ingredient…</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} — {i.current_stock} {i.purchase_unit}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : (
          <Field label="Product / item" required>
            <TextInput value={form.product_name} onChange={(e) => set('product_name', e.target.value)} placeholder="e.g. 6 cupcakes" />
          </Field>
        )}

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Quantity" required>
            <TextInput type="number" min={0.01} step="any" className="tnum" value={form.quantity} onChange={(e) => set('quantity', Number(e.target.value))} />
          </Field>
          <Field label="Category">
            <SelectInput value={form.category} onChange={(e) => set('category', e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Estimated value">
            <TextInput type="number" min={0} step="0.01" className="tnum" value={form.value} onChange={(e) => set('value', Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Reason" required hint="Shows up in your repeated-reasons report.">
          <TextInput value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="e.g. Left out too long / dropped tray" />
        </Field>

        <Field label="Notes">
          <TextArea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        {form.waste_type === 'ingredient' && ing && (
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-[#E8A3BA]" checked={form.deduct_stock} onChange={(e) => set('deduct_stock', e.target.checked)} />
            <span>
              Deduct {form.quantity} {ing.purchase_unit} from stock
              <span className="block text-[11.5px] text-muted">
                Creates one traceable “waste” movement. Current stock: {ing.current_stock} {ing.purchase_unit}.
              </span>
            </span>
          </label>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
