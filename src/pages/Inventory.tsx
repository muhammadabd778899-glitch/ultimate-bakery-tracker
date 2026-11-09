import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, History, ArrowDownUp, FileDown, Calculator, PackageSearch } from 'lucide-react'
import {
  PageHeader, Card, SearchInput, Badge, EmptyState, Modal, Field, TextInput, SelectInput, TextArea, TableWrap, THead,
  Confirm, ErrorNote, Grid,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import {
  listIngredients, ingredientCategories, createIngredient, updateIngredient, deleteIngredient, listMovements,
  applyMovement, recalculateAllStock, stockValuation, lowStockIngredients, expiringIngredients, listWaste,
  type MovementType,
} from '../repositories/inventory'
import { listSuppliers } from '../repositories/catalog'
import { getSettings } from '../repositories/settings'
import { formatDisplayDate, todayKey } from '../lib/dates'
import { formatMoney, getDateFormat } from '../lib/format'
import { UNITS } from '../lib/units'
import { exportCsv } from '../lib/exporters'

const CATEGORIES = [
  'Flour and grains', 'Sugar and sweeteners', 'Dairy', 'Chocolate and cocoa', 'Fruits', 'Nuts',
  'Flavorings', 'Baking supplies', 'Packaging', 'Other',
]

export function InventoryPage() {
  const [params, setParams] = useSearchParams()
  const toast = useApp((s) => s.toast)
  const settings = useApp((s) => s.settings)
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('All')
  const [onlyLow, setOnlyLow] = useState(false)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [moveFor, setMoveFor] = useState<string | null>(null)
  const [historyFor, setHistoryFor] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null)
      setOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
    const e = params.get('edit')
    if (e) {
      setEditing(e)
      setOpen(true)
      params.delete('edit')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const ingredients = useLive(() => listIngredients({ search, category: cat === 'All' ? undefined : cat }), [search, cat])
  const cats = useLive(() => ingredientCategories(), [])
  const suppliers = useLive(() => listSuppliers(), [])
  const valuation = useLive(() => stockValuation(), [])
  const low = useLive(() => lowStockIngredients(), [])
  const expiring = useLive(() => expiringIngredients(settings?.expiry_warning_days ?? 7), [settings?.expiry_warning_days])

  const rows = onlyLow ? ingredients.filter((i) => low.some((l) => l.id === i.id)) : ingredients

  const status = (i: { current_stock: number; min_stock: number; expiry_date: string | null }) => {
    if (i.expiry_date && i.expiry_date <= todayKey()) return { label: 'Expired', tone: 'danger' as const }
    if (i.current_stock <= 0) return { label: 'Out', tone: 'danger' as const }
    if (i.min_stock > 0 && i.current_stock <= i.min_stock) return { label: 'Low', tone: 'warning' as const }
    return { label: 'OK', tone: 'success' as const }
  }

  const doExport = () => {
    exportCsv(
      'inventory.csv',
      ['Ingredient', 'Category', 'Stock', 'Unit', 'Min stock', 'Avg cost', 'Value', 'Expiry'],
      ingredients.map((i) => [i.name, i.category, i.current_stock, i.purchase_unit, i.min_stock, i.avg_cost, i.current_stock * i.avg_cost, i.expiry_date ?? ''])
    )
    toast('success', 'Inventory exported')
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle={`${ingredients.length} ingredient${ingredients.length === 1 ? '' : 's'} · every change is recorded in the ledger`}
        actions={
          <>
            <button className="btn-secondary" onClick={doExport}>
              <FileDown size={15} /> CSV
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                try {
                  const r = recalculateAllStock()
                  toast('success', 'Stock recalculated', `${r.checked} ingredients checked, ${r.fixed} corrected from the ledger.`)
                } catch (e) {
                  toast('error', 'Recalculation failed', e instanceof Error ? e.message : String(e))
                }
              }}
              title="Recompute every stock level from its movement history"
            >
              <Calculator size={15} /> Recalculate
            </button>
            <button className="btn-primary" onClick={() => { setEditing(null); setOpen(true) }}>
              <Plus size={15} /> New ingredient
            </button>
          </>
        }
      />

      <Grid cols={4} className="mb-5">
        <MiniStat label="Stock value" value={formatMoney(valuation.total)} />
        <MiniStat label="Low stock" value={String(low.length)} tone={low.length ? 'text-warn' : undefined} />
        <MiniStat label="Expiring soon" value={String(expiring.length)} tone={expiring.length ? 'text-bad' : undefined} />
        <MiniStat label="Ingredients" value={String(valuation.rows.length)} />
      </Grid>

      <Card className="p-4 mb-5 no-print">
        <div className="flex flex-wrap gap-2.5 items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search ingredients…" className="w-full sm:w-64" />
          <SelectInput className="!w-auto" value={cat} onChange={(e) => setCat(e.target.value)}>
            <option>All</option>
            {cats.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectInput>
          <label className="flex items-center gap-2 text-[13px] text-muted cursor-pointer">
            <input type="checkbox" className="accent-[#E8A3BA]" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} />
            Only low stock
          </label>
        </div>
      </Card>

      <Card className="p-0">
        {rows.length === 0 ? (
          <EmptyState
            title={search || onlyLow ? 'Nothing to show' : 'No ingredients yet'}
            description={
              onlyLow
                ? 'Nothing is at or below its minimum level.'
                : 'Add what you keep in stock. Purchases, production, waste and adjustments all update it — with a reason each time.'
            }
            icon={<PackageSearch size={26} />}
            action={
              !search && !onlyLow && (
                <button className="btn-primary" onClick={() => { setEditing(null); setOpen(true) }}>
                  <Plus size={15} /> Add ingredient
                </button>
              )
            }
          />
        ) : (
          <TableWrap>
            <THead cols={['Ingredient', 'Category', 'In stock', 'Min', 'Avg cost', 'Value', 'Expiry', 'Status', '']} />
            <tbody className="divide-y divide-line">
              {rows.map((i) => {
                const st = status(i)
                return (
                  <tr key={i.id} className="hover:bg-pale">
                    <td className="td font-medium">
                      {i.name}
                      <span className="block text-[11.5px] text-muted font-normal">{i.storage_location || i.supplier_id ? '' : ''}</span>
                    </td>
                    <td className="td text-muted text-[12.5px]">{i.category}</td>
                    <td className="td tnum font-medium">{i.current_stock} {i.purchase_unit}</td>
                    <td className="td tnum text-muted">{i.min_stock}</td>
                    <td className="td tnum">{formatMoney(i.avg_cost)}</td>
                    <td className="td tnum font-medium">{formatMoney(i.current_stock * i.avg_cost)}</td>
                    <td className="td tnum text-[12.5px] text-muted">{i.expiry_date ? formatDisplayDate(i.expiry_date, getDateFormat()) : '—'}</td>
                    <td className="td"><Badge tone={st.tone}>{st.label}</Badge></td>
                    <td className="td text-right whitespace-nowrap no-print">
                      <button className="btn-ghost !h-8 !px-2" title="Adjust stock" onClick={() => setMoveFor(i.id)}>
                        <ArrowDownUp size={15} />
                      </button>
                      <button className="btn-ghost !h-8 !px-2" title="History" onClick={() => setHistoryFor(i.id)}>
                        <History size={15} />
                      </button>
                      <button className="btn-ghost !h-8 !px-2" title="Edit" onClick={() => { setEditing(i.id); setOpen(true) }}>
                        <Pencil size={15} />
                      </button>
                      <button className="btn-ghost !h-8 !px-2" title="Delete" onClick={() => setToDelete(i.id)}>
                        <Trash2 size={15} className="text-bad" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <IngredientModal open={open} ingredientId={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); toast('success', editing ? 'Ingredient updated' : 'Ingredient added') }} />
      <AdjustModal ingredientId={moveFor} onClose={() => setMoveFor(null)} />
      <HistoryModal ingredientId={historyFor} onClose={() => setHistoryFor(null)} />

      <Confirm
        open={!!toDelete}
        title="Delete this ingredient?"
        message="Its stock history is removed too, because the history belongs to the ingredient. Recipes keep the name and quantity they used, so past production records remain readable."
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          try {
            if (toDelete) deleteIngredient(toDelete)
            toast('success', 'Ingredient deleted')
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

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card className="p-4">
      <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p className={`mt-1.5 text-[21px] font-semibold tnum ${tone ?? 'text-ink'}`}>{value}</p>
    </Card>
  )
}

/* ================================ Ingredient modal ================================ */

function IngredientModal({ open, ingredientId, onClose, onSaved }: { open: boolean; ingredientId: string | null; onClose: () => void; onSaved: () => void }) {
  const [error, setError] = useState('')
  const suppliers = useLive(() => listSuppliers(), [])
  const existing = useLive(() => (open && ingredientId ? listIngredients().find((i) => i.id === ingredientId) : undefined), [open, ingredientId])
  const [form, setForm] = useState({
    name: '', category: 'Flour and grains', purchase_unit: 'g', min_stock: 0, reorder_qty: 0,
    avg_cost: 0, supplier_id: '', storage_location: '', expiry_date: '', notes: '',
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    setForm(
      existing
        ? {
            name: existing.name, category: existing.category, purchase_unit: existing.purchase_unit,
            min_stock: existing.min_stock, reorder_qty: existing.reorder_qty, avg_cost: existing.avg_cost,
            supplier_id: existing.supplier_id ?? '', storage_location: existing.storage_location,
            expiry_date: existing.expiry_date ?? '', notes: existing.notes,
          }
        : { name: '', category: 'Flour and grains', purchase_unit: 'g', min_stock: 0, reorder_qty: 0, avg_cost: 0, supplier_id: '', storage_location: '', expiry_date: '', notes: '' }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ingredientId])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Ingredient name is required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        ...form,
        supplier_id: form.supplier_id || null,
        expiry_date: form.expiry_date || null,
        min_stock: Number(form.min_stock) || 0,
        reorder_qty: Number(form.reorder_qty) || 0,
        avg_cost: Number(form.avg_cost) || 0,
      }
      if (ingredientId) updateIngredient(ingredientId, payload)
      else createIngredient(payload)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ingredientId ? 'Edit ingredient' : 'New ingredient'}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{ingredientId ? 'Save changes' : 'Add ingredient'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Name" required>
          <TextInput autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Plain Flour" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Category">
            <TextInput list="ing-cats" value={form.category} onChange={(e) => set('category', e.target.value)} />
            <datalist id="ing-cats">
              {CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Purchase unit" hint="The unit you buy and stock it in.">
            <SelectInput value={form.purchase_unit} onChange={(e) => set('purchase_unit', e.target.value)}>
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Minimum stock" hint="Warns you at or below this level.">
            <TextInput type="number" min={0} step="any" className="tnum" value={form.min_stock} onChange={(e) => set('min_stock', Number(e.target.value))} />
          </Field>
          <Field label="Reorder quantity">
            <TextInput type="number" min={0} step="any" className="tnum" value={form.reorder_qty} onChange={(e) => set('reorder_qty', Number(e.target.value))} />
          </Field>
          <Field label="Average purchase cost" hint={`Per ${form.purchase_unit} — updated when you record purchases.`}>
            <TextInput type="number" min={0} step="0.0001" className="tnum" value={form.avg_cost} onChange={(e) => set('avg_cost', Number(e.target.value))} />
          </Field>
          <Field label="Preferred supplier">
            <SelectInput value={form.supplier_id} onChange={(e) => set('supplier_id', e.target.value)}>
              <option value="">—</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Storage location">
            <TextInput value={form.storage_location} onChange={(e) => set('storage_location', e.target.value)} placeholder="e.g. Dry store shelf 2" />
          </Field>
          <Field label="Expiry date" hint="Optional — used for expiry reminders.">
            <TextInput type="date" value={form.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <TextArea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {ingredientId && (
          <p className="hint">
            Changing these details never changes your stock level — stock only moves through recorded movements.
          </p>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

/* ================================ Adjust ================================ */

function AdjustModal({ ingredientId, onClose }: { ingredientId: string | null; onClose: () => void }) {
  const toast = useApp((s) => s.toast)
  const [mode, setMode] = useState<MovementType>('adjustment')
  const [qty, setQty] = useState(1)
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(todayKey())
  const [error, setError] = useState('')
  const ing = useLive(() => (ingredientId ? listIngredients().find((i) => i.id === ingredientId) : undefined), [ingredientId])

  const submit = () => {
    setError('')
    if (!ing) return
    try {
      const signed = mode === 'adjustment' || mode === 'return' || mode === 'purchase' ? Math.abs(qty) : -Math.abs(qty)
      applyMovement({
        ingredient_id: ing.id,
        movement_type: mode,
        quantity: signed,
        movement_date: date,
        reason: reason.trim() || `${mode} recorded manually`,
      })
      toast('success', 'Stock updated', `${ing.name} is now ${Math.round((ing.current_stock + signed) * 100) / 100} ${ing.purchase_unit}.`)
      setReason('')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!ingredientId) return null

  return (
    <Modal
      open={!!ingredientId}
      onClose={onClose}
      title={`Adjust stock · ${ing?.name ?? ''}`}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Record movement</button>
        </>
      }
    >
      <div className="space-y-3.5">
        {ing && (
          <div className="rounded-xl bg-pale border border-line p-3.5 text-[13px] flex justify-between">
            <span className="text-muted">Current stock</span>
            <span className="tnum font-medium">{ing.current_stock} {ing.purchase_unit}</span>
          </div>
        )}
        <Field label="Movement type">
          <SelectInput value={mode} onChange={(e) => setMode(e.target.value as MovementType)}>
            <option value="adjustment">Manual adjustment (stocktake)</option>
            <option value="return">Return (stock added back)</option>
            <option value="correction">Correction</option>
            <option value="waste">Waste (stock removed)</option>
            <option value="purchase">Purchase received</option>
          </SelectInput>
        </Field>
        <Field label={`Quantity in ${ing?.purchase_unit ?? 'units'}`} required>
          <TextInput type="number" step="any" className="tnum" value={qty} onChange={(e) => setQty(Number(e.target.value))} />
        </Field>
        <p className="hint">
          {mode === 'adjustment' || mode === 'return' || mode === 'purchase'
            ? 'This adds to stock.'
            : 'This removes from stock.'}
        </p>
        <Field label="Date">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reason" required hint="Every stock change must be traceable.">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Monthly stocktake variance" />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

/* ================================ History ================================ */

function HistoryModal({ ingredientId, onClose }: { ingredientId: string | null; onClose: () => void }) {
  const rows = useLive(() => (ingredientId ? listMovements({ ingredientId, limit: 200 }) : []), [ingredientId])
  const waste = useLive(() => (ingredientId ? listWaste().filter((w) => w.ingredient_id === ingredientId) : []), [ingredientId])
  const ing = useLive(() => (ingredientId ? listIngredients().find((i) => i.id === ingredientId) : undefined), [ingredientId])

  if (!ingredientId) return null

  const tone: Record<string, 'success' | 'danger' | 'warning' | 'neutral' | 'pink'> = {
    purchase: 'success',
    production_consumption: 'pink',
    waste: 'danger',
    adjustment: 'neutral',
    return: 'success',
    correction: 'warning',
  }

  return (
    <Modal open={!!ingredientId} onClose={onClose} title={`Stock history · ${ing?.name ?? ''}`} size="lg">
      {rows.length === 0 ? (
        <EmptyState title="No movements yet" description="Every purchase, consumption, waste and adjustment appears here." />
      ) : (
        <TableWrap>
          <THead cols={['Date', 'Movement', 'Change', 'Stock after', 'Reason']} />
          <tbody className="divide-y divide-line">
            {rows.map((m) => (
              <tr key={m.id}>
                <td className="td tnum text-[12.5px]">{formatDisplayDate(m.movement_date, getDateFormat())}</td>
                <td className="td"><Badge tone={tone[m.movement_type] ?? 'neutral'}>{m.movement_type.replace(/_/g, ' ')}</Badge></td>
                <td className={`td tnum font-medium ${m.quantity >= 0 ? 'text-ok' : 'text-bad'}`}>
                  {m.quantity >= 0 ? '+' : ''}
                  {m.quantity}
                </td>
                <td className="td tnum">{m.stock_after}</td>
                <td className="td text-[12.5px] text-muted">{m.reason}</td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {waste.length > 0 && (
        <>
          <h4 className="section-title mt-6 mb-2">Waste records</h4>
          <TableWrap>
            <THead cols={['Date', 'Quantity', 'Category', 'Reason', 'Value']} />
            <tbody className="divide-y divide-line">
              {waste.map((w) => (
                <tr key={w.id}>
                  <td className="td tnum text-[12.5px]">{formatDisplayDate(w.waste_date, getDateFormat())}</td>
                  <td className="td tnum">{w.quantity} {w.unit}</td>
                  <td className="td">{w.category}</td>
                  <td className="td text-[12.5px] text-muted">{w.reason}</td>
                  <td className="td tnum">{formatMoney(w.value)}</td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </>
      )}
    </Modal>
  )
}
