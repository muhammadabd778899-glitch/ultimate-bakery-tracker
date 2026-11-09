import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Plus, Pencil, Trash2, Factory, CheckCircle2, AlertTriangle, PackageMinus, RotateCcw, Eye, CalendarDays, FileDown,
} from 'lucide-react'
import {
  PageHeader, Card, Grid, SearchInput, Badge, STATUS_TONE, EmptyState, Modal, Field, TextInput, SelectInput, TextArea,
  TableWrap, THead, Confirm, ErrorNote, ProgressBar,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import {
  listBatches, createBatch, updateBatch, deleteBatch, setBatchStatus, getBatch, getConsumption, consumptionPreview,
  commitConsumption, reverseConsumption, productionCandidates, batchStats,
} from '../repositories/production'
import { listRecipes, getRecipe } from '../repositories/recipes'
import { listProducts } from '../repositories/catalog'
import { listOrders, getOrder } from '../repositories/orders'
import { listWaste, recordWaste } from '../repositories/inventory'
import { productionReport } from '../repositories/reports'
import { BATCH_STATUSES } from '../types'
import { formatDisplayDate, todayKey, startOfWeek, endOfWeek, relativeDay } from '../lib/dates'
import { formatMoney, getDateFormat } from '../lib/format'
import { exportCsv } from '../lib/exporters'

export function ProductionPage() {
  const [params, setParams] = useSearchParams()
  const toast = useApp((s) => s.toast)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [from, setFrom] = useState(startOfWeek(todayKey()))
  const [to, setTo] = useState(endOfWeek(todayKey()))
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<string | null>(null)

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditing(null)
      setOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const batches = useLive(() => listBatches({ search, status, from, to }), [search, status, from, to])
  const stats = useLive(() => batchStats(from, to), [from, to])
  const periodCost = useLive(() => productionReport(from, to).ingredientCost, [from, to])

  const doExport = () => {
    exportCsv(
      'production-batches.csv',
      ['Batch', 'Date', 'Order', 'Product', 'Recipe', 'Planned', 'Actual', 'Waste', 'Status', 'Consumption recorded'],
      batches.map((b) => [b.batch_no, b.production_date, b.order_no ?? '', b.product_name, b.recipe_name, b.planned_qty, b.actual_qty, b.waste_qty, b.status, b.consumption_committed ? 'yes' : 'no'])
    )
    toast('success', 'Production exported')
  }

  return (
    <>
      <PageHeader
        title="Production"
        subtitle="Plan batches, review what they need, and record consumption exactly once"
        actions={
          <>
            <button className="btn-secondary" onClick={doExport}>
              <FileDown size={15} /> CSV
            </button>
            <button className="btn-primary" onClick={() => { setEditing(null); setOpen(true) }}>
              <Plus size={15} /> New batch
            </button>
          </>
        }
      />

      <Grid cols={4} className="mb-5">
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Planned vs actual</p>
          <p className="mt-1.5 text-[21px] font-semibold tnum">
            {stats.actual} <span className="text-muted text-[15px]">/ {stats.planned}</span>
          </p>
          <div className="mt-2"><ProgressBar value={stats.actual} max={Math.max(stats.planned, 1)} tone={stats.actual >= stats.planned ? 'success' : 'pink'} /></div>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Batches in period</p>
          <p className="mt-1.5 text-[21px] font-semibold tnum">{stats.total}</p>
          <p className="text-[11.5px] text-muted mt-1">{from && to ? `${formatDisplayDate(from, getDateFormat())} → ${formatDisplayDate(to, getDateFormat())}` : 'All dates'}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Recorded ingredient cost</p>
          <p className="mt-1.5 text-[21px] font-semibold tnum">{formatMoney(periodCost)}</p>
          <p className="text-[11.5px] text-muted mt-1">What production actually consumed in this period</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">Waste quantity</p>
          <p className={`mt-1.5 text-[21px] font-semibold tnum ${stats.wasted > 0 ? 'text-warn' : 'text-ink'}`}>{stats.wasted}</p>
          <p className="text-[11.5px] text-muted mt-1">Units recorded as wasted</p>
        </Card>
      </Grid>

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
          <SearchInput value={search} onChange={setSearch} placeholder="Batch, product, order…" className="w-full sm:w-56" />
          <SelectInput className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option>All</option>
            {BATCH_STATUSES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </SelectInput>
          <button className="btn-ghost" onClick={() => { setFrom(startOfWeek(todayKey())); setTo(endOfWeek(todayKey())); setStatus('All'); setSearch('') }}>
            This week
          </button>
        </div>
      </Card>

      <Card className="p-0">
        {batches.length === 0 ? (
          <EmptyState
            title="No production batches"
            description="Convert a confirmed order into production tasks, or create a batch by hand. Consumption is only recorded when you complete a batch."
            icon={<Factory size={26} />}
            action={
              <button className="btn-primary" onClick={() => { setEditing(null); setOpen(true) }}>
                <Plus size={15} /> Create batch
              </button>
            }
          />
        ) : (
          <TableWrap>
            <THead cols={['Batch', 'Date', 'Order', 'Product', 'Recipe', 'Planned', 'Actual', 'Status', 'Stock', '']} />
            <tbody className="divide-y divide-line">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-pale">
                  <td className="td font-medium">{b.batch_no}</td>
                  <td className="td tnum text-[12.5px]">
                    {formatDisplayDate(b.production_date, getDateFormat())}
                    <span className="block text-[11px] text-muted">{relativeDay(b.production_date)}</span>
                  </td>
                  <td className="td text-[12.5px]">
                    {b.order_id ? <Link to={`/orders/${b.order_id}`} className="text-pink-600 hover:underline">{b.order_no}</Link> : <span className="text-muted">—</span>}
                  </td>
                  <td className="td">{b.product_name}</td>
                  <td className="td text-muted text-[12.5px]">{b.recipe_name || <span className="text-warn">no recipe</span>}</td>
                  <td className="td tnum">{b.planned_qty}</td>
                  <td className="td tnum font-medium">{b.actual_qty || '—'}</td>
                  <td className="td">
                    <select
                      className="input !h-8 !text-[12px] !px-2 !w-auto"
                      value={b.status}
                      onChange={(e) => {
                        try {
                          setBatchStatus(b.id, e.target.value)
                          toast('success', 'Status updated', `${b.batch_no} → ${e.target.value}`)
                        } catch (err) {
                          toast('error', 'Could not update', err instanceof Error ? err.message : String(err))
                        }
                      }}
                    >
                      {BATCH_STATUSES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td className="td">
                    {b.consumption_committed ? (
                      <Badge tone="success">recorded</Badge>
                    ) : b.recipe_id ? (
                      <Badge tone="warning">pending</Badge>
                    ) : (
                      <Badge tone="neutral">n/a</Badge>
                    )}
                  </td>
                  <td className="td text-right whitespace-nowrap no-print">
                    <button className="btn-ghost !h-8 !px-2" title="Open batch" onClick={() => setViewing(b.id)}>
                      <Eye size={15} />
                    </button>
                    <button className="btn-ghost !h-8 !px-2" title="Edit" onClick={() => { setEditing(b.id); setOpen(true) }}>
                      <Pencil size={15} />
                    </button>
                    <button className="btn-ghost !h-8 !px-2" title="Delete" onClick={() => setToDelete(b.id)}>
                      <Trash2 size={15} className="text-bad" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <BatchModal open={open} batchId={editing} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); toast('success', editing ? 'Batch updated' : 'Batch created', 'Stock is untouched until you record completion.') }} />
      <BatchDetail batchId={viewing} onClose={() => setViewing(null)} />

      <Confirm
        open={!!toDelete}
        title="Delete this batch?"
        message={
          'If the batch already consumed ingredients, the stock it took is restored with a traceable correction entry — inventory is never left inconsistent.'
        }
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          try {
            if (toDelete) deleteBatch(toDelete)
            toast('success', 'Batch deleted')
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

/* ================================ Batch editor ================================ */

function BatchModal({ open, batchId, onClose, onSaved }: { open: boolean; batchId: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useApp((s) => s.toast)
  const recipes = useLive(() => (open ? listRecipes() : []), [open])
  const products = useLive(() => (open ? listProducts() : []), [open])
  const orders = useLive(
    () => (open ? listOrders({ status: 'All' }).filter((o) => o.status !== 'Cancelled') : []),
    [open]
  )
  const existing = useLive(() => (open && batchId ? getBatch(batchId) : undefined), [open, batchId])

  const [form, setForm] = useState({
    production_date: todayKey(),
    order_id: '',
    product_id: '',
    recipe_id: '',
    planned_qty: 1,
    actual_qty: 0,
    status: 'Planned',
    priority: 'Normal',
    start_time: '',
    end_time: '',
    labor_minutes: 0,
    waste_qty: 0,
    instructions: '',
    notes: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    if (existing) {
      setForm({
        production_date: existing.production_date,
        order_id: existing.order_id ?? '',
        product_id: existing.product_id ?? '',
        recipe_id: existing.recipe_id ?? '',
        planned_qty: existing.planned_qty,
        actual_qty: existing.actual_qty,
        status: existing.status,
        priority: existing.priority,
        start_time: existing.start_time,
        end_time: existing.end_time,
        labor_minutes: existing.labor_minutes,
        waste_qty: existing.waste_qty,
        instructions: existing.instructions,
        notes: existing.notes,
      })
    } else {
      setForm({
        production_date: todayKey(), order_id: '', product_id: '', recipe_id: '', planned_qty: 1, actual_qty: 0,
        status: 'Planned', priority: 'Normal', start_time: '', end_time: '', labor_minutes: 0, waste_qty: 0,
        instructions: '', notes: '',
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, batchId])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const candidates = useLive(
    () => (open && form.order_id ? productionCandidates(form.order_id) : []),
    [open, form.order_id]
  )

  const submit = async () => {
    setError('')
    setSaving(true)
    try {
      const recipe = form.recipe_id ? recipes.find((r) => r.id === form.recipe_id) : undefined
      const product = form.product_id ? products.find((p) => p.id === form.product_id) : undefined
      const payload = {
        ...form,
        order_id: form.order_id || null,
        product_id: form.product_id || null,
        recipe_id: form.recipe_id || null,
        product_name: product?.name ?? '',
        recipe_name: recipe?.name ?? '',
      }
      if (batchId) updateBatch(batchId, payload)
      else createBatch(payload)
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
      title={batchId ? 'Edit batch' : 'New production batch'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : batchId ? 'Save changes' : 'Create batch'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Production date" required>
            <TextInput type="date" value={form.production_date} onChange={(e) => set('production_date', e.target.value)} />
          </Field>
          <Field label="Priority">
            <SelectInput value={form.priority} onChange={(e) => set('priority', e.target.value)}>
              <option>High</option>
              <option>Normal</option>
              <option>Low</option>
            </SelectInput>
          </Field>

          <Field label="Linked order" hint="Optional. Confirmed orders can also be planned from the order page.">
            <SelectInput value={form.order_id} onChange={(e) => set('order_id', e.target.value)}>
              <option value="">— Not linked —</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.order_no} · {o.customer_name}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Product" hint={form.order_id ? 'Pre-filled from the order — pick another item from it below.' : undefined}>
            <SelectInput
              value={form.product_id}
              onChange={(e) => {
                const p = products.find((x) => x.id === e.target.value)
                setForm((f) => ({ ...f, product_id: e.target.value, recipe_id: p?.recipe_id ?? f.recipe_id }))
              }}
            >
              <option value="">— Select product —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </SelectInput>
          </Field>

          {form.order_id && candidates.length > 0 && (
            <div className="sm:col-span-2 rounded-xl border border-line divide-y divide-line">
              <p className="px-3.5 py-2 bg-warm text-[12px] font-semibold border-b border-line">Order items — pick one to fill the form</p>
              {candidates.map((c, i) => (
                <button
                  key={i}
                  className="w-full flex items-center gap-3 px-3.5 py-2 text-left hover:bg-pink-50 text-[13px]"
                  onClick={() => setForm((f) => ({ ...f, product_id: c.product_id ?? '', recipe_id: c.recipe_id ?? '', planned_qty: c.quantity }))}
                >
                  <span className="flex-1">{c.product_name}</span>
                  <span className="tnum text-muted">× {c.quantity}</span>
                  <Badge tone={c.recipe_id ? 'success' : 'warning'}>{c.recipe_id ? 'recipe ready' : 'no recipe'}</Badge>
                </button>
              ))}
            </div>
          )}

          <Field label="Recipe" hint="Drives the ingredient consumption calculation.">
            <SelectInput value={form.recipe_id} onChange={(e) => set('recipe_id', e.target.value)}>
              <option value="">— No recipe —</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} (makes {r.yield_qty} {r.yield_unit})
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Status">
            <SelectInput value={form.status} onChange={(e) => set('status', e.target.value)}>
              {BATCH_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Planned quantity" required>
            <TextInput type="number" min={0.01} step="any" className="tnum" value={form.planned_qty} onChange={(e) => set('planned_qty', Number(e.target.value))} />
          </Field>
          <Field label="Actual quantity" hint="What you actually produced. Used for consumption.">
            <TextInput type="number" min={0} step="any" className="tnum" value={form.actual_qty} onChange={(e) => set('actual_qty', Number(e.target.value))} />
          </Field>
          <Field label="Waste quantity">
            <TextInput type="number" min={0} step="any" className="tnum" value={form.waste_qty} onChange={(e) => set('waste_qty', Number(e.target.value))} />
          </Field>
          <Field label="Labour minutes">
            <TextInput type="number" min={0} className="tnum" value={form.labor_minutes} onChange={(e) => set('labor_minutes', Number(e.target.value))} />
          </Field>
          <Field label="Start time">
            <TextInput type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} />
          </Field>
          <Field label="End time">
            <TextInput type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} />
          </Field>
        </div>

        <Field label="Production instructions">
          <TextArea rows={2} value={form.instructions} onChange={(e) => set('instructions', e.target.value)} placeholder="e.g. Decorate with white buttercream, gold toppers" />
        </Field>
        <Field label="Notes">
          <TextArea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>

        <p className="hint">
          Creating a batch never changes stock. Ingredients are only deducted when you record completion below.
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

/* ================================ Batch detail ================================ */

function BatchDetail({ batchId, onClose }: { batchId: string | null; onClose: () => void }) {
  const toast = useApp((s) => s.toast)
  const [confirmReverse, setConfirmReverse] = useState(false)
  const [wasteOpen, setWasteOpen] = useState(false)

  const data = useLive(() => {
    if (!batchId) return null
    const batch = getBatch(batchId)
    if (!batch) return null
    const preview = consumptionPreview(batchId)
    const recorded = getConsumption(batchId)
    const waste = listWaste().filter((w) => w.batch_id === batchId)
    const orderNo = batch.order_id ? getOrder(batch.order_id)?.order_no ?? '' : ''
    return { batch, preview, recorded, waste, orderNo }
  }, [batchId])

  if (!batchId || !data) return null
  const { batch, preview, recorded, waste, orderNo } = data

  const commit = () => {
    try {
      const r = commitConsumption(batch.id)
      if (r.skipped) toast('info', 'Already recorded', 'This batch had already consumed stock — nothing was deducted again.')
      else toast('success', 'Ingredients consumed', `${r.lines} stock movement${r.lines === 1 ? '' : 's'} recorded.`)
    } catch (e) {
      toast('error', 'Could not record consumption', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={!!batchId}
      onClose={onClose}
      title={`${batch.batch_no} · ${batch.product_name}`}
      size="xl"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Close</button>
          {batch.consumption_committed ? (
            <button className="btn-secondary" onClick={() => setConfirmReverse(true)}>
              <RotateCcw size={15} /> Reverse consumption
            </button>
          ) : (
            <button className="btn-primary" onClick={commit} disabled={!batch.recipe_id}>
              <PackageMinus size={15} /> Record completion & consume ingredients
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-4 gap-3">
          <Info label="Production date" value={formatDisplayDate(batch.production_date, getDateFormat())} />
          <Info label="Status" value={batch.status} />
          <Info label="Planned" value={String(batch.planned_qty)} />
          <Info label="Actual" value={String(batch.actual_qty || '—')} />
        </div>

        {batch.order_id && (
          <p className="text-[13px] text-muted">
            Linked to <Link to={`/orders/${batch.order_id}`} className="text-pink-600 hover:underline" onClick={onClose}>{orderNo || 'View order'}</Link>
          </p>
        )}

        {!batch.recipe_id ? (
          <div className="rounded-xl bg-[#FCF1E1] border border-[#F3DFC0] text-[#8A5F24] text-[13px] px-4 py-3">
            This batch has no recipe, so no ingredient consumption can be calculated. You can still record waste and quantities.
          </div>
        ) : batch.consumption_committed ? (
          <div className="rounded-xl bg-[#EAF4EE] border border-[#CBE3D5] text-[#3F6C53] text-[13px] px-4 py-3 flex items-center gap-2">
            <CheckCircle2 size={16} />
            Ingredient consumption recorded once for this batch. Saving again will not deduct stock again.
          </div>
        ) : (
          <div className="rounded-xl bg-pale border border-line px-4 py-3 text-[13px] flex items-start gap-2">
            <AlertTriangle size={16} className="text-warn mt-0.5" />
            <span>
              Review the expected consumption below, then confirm. This is the only action that changes stock for this batch.
            </span>
          </div>
        )}

        <div>
          <h4 className="section-title mb-2">{batch.consumption_committed ? 'Recorded consumption' : 'Expected consumption'}</h4>
          {(batch.consumption_committed ? recorded.length : preview.lines.length) === 0 ? (
            <EmptyState title="Nothing to consume" description="Add ingredients to the recipe to see expected usage." />
          ) : batch.consumption_committed ? (
            <TableWrap>
              <THead cols={['Ingredient', 'Quantity', 'Unit cost', 'Total cost']} />
              <tbody className="divide-y divide-line">
                {recorded.map((r) => (
                  <tr key={r.id}>
                    <td className="td font-medium">{r.ingredient_name}</td>
                    <td className="td tnum">{r.quantity} {r.unit}</td>
                    <td className="td tnum">{formatMoney(r.unit_cost)}</td>
                    <td className="td tnum">{formatMoney(r.total_cost)}</td>
                  </tr>
                ))}
                <tr className="bg-pale font-medium">
                  <td className="td">Total</td>
                  <td className="td" />
                  <td className="td" />
                  <td className="td tnum">{formatMoney(recorded.reduce((s, r) => s + r.total_cost, 0))}</td>
                </tr>
              </tbody>
            </TableWrap>
          ) : (
            <TableWrap>
              <THead cols={['Ingredient', 'Needed', 'In stock', 'Enough?']} />
              <tbody className="divide-y divide-line">
                {preview.lines.map((l, i) => (
                  <tr key={i}>
                    <td className="td font-medium">{l.ingredient_name}</td>
                    <td className="td tnum">{l.quantity} {l.unit}</td>
                    <td className="td tnum text-muted">{l.available}</td>
                    <td className="td">
                      {l.enough ? <Badge tone="success">yes</Badge> : <Badge tone="danger">not enough</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </div>

        {!preview.committed && preview.lines.some((l) => !l.enough) && (
          <div className="rounded-xl bg-[#FBEAEB] border border-[#F3C9CD] text-[#8E414A] text-[13px] px-4 py-3">
            Some ingredients are below what this batch needs. Record a purchase first, or allow negative stock in Settings if
            you are certain.
          </div>
        )}

        {waste.length > 0 && (
          <div>
            <h4 className="section-title mb-2">Waste on this batch</h4>
            <TableWrap>
              <THead cols={['Date', 'Item', 'Quantity', 'Category', 'Reason', 'Value']} />
              <tbody className="divide-y divide-line">
                {waste.map((w) => (
                  <tr key={w.id}>
                    <td className="td tnum text-[12.5px]">{formatDisplayDate(w.waste_date, getDateFormat())}</td>
                    <td className="td">{w.ingredient_name || w.product_name}</td>
                    <td className="td tnum">{w.quantity} {w.unit}</td>
                    <td className="td">{w.category}</td>
                    <td className="td text-[12.5px] text-muted">{w.reason}</td>
                    <td className="td tnum">{formatMoney(w.value)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}

        <div className="flex justify-between items-center pt-3 border-t border-line">
          <p className="text-[12.5px] text-muted">
            {batch.labor_minutes ? `Labour ${batch.labor_minutes} min · ` : ''}
            {batch.waste_qty ? `Waste ${batch.waste_qty} · ` : ''}
            Created {formatDisplayDate(batch.created_at.slice(0, 10), getDateFormat())}
          </p>
          <button className="btn-secondary !h-9" onClick={() => setWasteOpen(true)}>
            <AlertTriangle size={15} /> Record waste
          </button>
        </div>
      </div>

      <Confirm
        open={confirmReverse}
        title="Reverse this consumption?"
        message="The stock is returned with correction entries, and the original consumption records stay visible in the ledger for auditing."
        confirmLabel="Reverse it"
        danger
        onConfirm={() => {
          try {
            const n = reverseConsumption(batch.id)
            toast('success', 'Consumption reversed', `${n} correction entr${n === 1 ? 'y' : 'ies'} created.`)
          } catch (e) {
            toast('error', 'Could not reverse', e instanceof Error ? e.message : String(e))
          } finally {
            setConfirmReverse(false)
          }
        }}
        onCancel={() => setConfirmReverse(false)}
      />

      <WasteModal open={wasteOpen} batchId={batch.id} productName={batch.product_name} onClose={() => setWasteOpen(false)} />
    </Modal>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p className="text-[15px] font-medium mt-1">{value}</p>
    </div>
  )
}

function WasteModal({ open, batchId, productName, onClose }: { open: boolean; batchId: string; productName: string; onClose: () => void }) {
  const toast = useApp((s) => s.toast)
  const [form, setForm] = useState({ waste_date: todayKey(), waste_type: 'product', ingredient_id: '', quantity: 1, unit: 'pcs', category: 'Failed batch', reason: '', value: 0, notes: '', deduct_stock: false })
  const [error, setError] = useState('')

  const submit = () => {
    setError('')
    try {
      recordWaste({
        waste_date: form.waste_date,
        waste_type: form.waste_type as 'ingredient' | 'product',
        ingredient_id: form.ingredient_id || null,
        batch_id: batchId,
        product_name: productName,
        quantity: Number(form.quantity),
        unit: form.unit,
        category: form.category,
        reason: form.reason,
        value: Number(form.value) || 0,
        notes: form.notes,
        deduct_stock: form.deduct_stock,
      })
      toast('success', 'Waste recorded')
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record waste"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Save</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <TextInput type="date" value={form.waste_date} onChange={(e) => setForm((f) => ({ ...f, waste_date: e.target.value }))} />
          </Field>
          <Field label="Quantity" required>
            <TextInput type="number" min={0.01} step="any" className="tnum" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))} />
          </Field>
        </div>
        <Field label="Category">
          <SelectInput value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
            {['Failed batch', 'Overproduction', 'Damaged product', 'Customer return', 'Expired stock', 'Other'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Reason" required>
          <TextInput value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Overbaked tray" />
        </Field>
        <Field label="Estimated value">
          <TextInput type="number" min={0} step="0.01" className="tnum" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: Number(e.target.value) }))} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
