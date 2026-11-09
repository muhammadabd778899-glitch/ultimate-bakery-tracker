import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, Truck, PackageCheck, PackageOpen, CheckCircle2, Phone, MapPin, FileDown } from 'lucide-react'
import {
  PageHeader, Card, Grid, SearchInput, Badge, EmptyState, Modal, Field, TextInput, SelectInput, TextArea, TableWrap, THead,
  Confirm, ErrorNote,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../repositories/catalog'
import {
  listPurchases, createPurchase, updatePurchase, receivePurchase, deletePurchase, getPurchaseItems, type PurchaseDraftItem,
} from '../repositories/inventory'
import { listIngredients } from '../repositories/inventory'
import { formatDisplayDate, todayKey } from '../lib/dates'
import { formatMoney, getDateFormat } from '../lib/format'
import { query } from '../db/database'
import { exportCsv } from '../lib/exporters'

export function SuppliersPage() {
  const [params, setParams] = useSearchParams()
  const toast = useApp((s) => s.toast)
  const [tab, setTab] = useState<'purchases' | 'suppliers'>('purchases')
  const [search, setSearch] = useState('')
  const [supOpen, setSupOpen] = useState(false)
  const [supEdit, setSupEdit] = useState<string | null>(null)
  const [purOpen, setPurOpen] = useState(false)
  const [purEdit, setPurEdit] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<{ kind: 'sup' | 'pur'; id: string } | null>(null)
  const [supDelete, setSupDelete] = useState<string | null>(null)

  useEffect(() => {
    if (params.get('new') === 'purchase') {
      setTab('purchases')
      setPurEdit(null)
      setPurOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const suppliers = useLive(() => listSuppliers(search), [search])
  const purchases = useLive(() => listPurchases(search), [search])
  const pending = purchases.filter((p) => !p.received)

  const doExport = () => {
    if (tab === 'suppliers') {
      exportCsv('suppliers.csv', ['Name', 'Contact', 'Phone', 'Email', 'Address', 'Notes'], suppliers.map((s) => [s.name, s.contact_person, s.phone, s.email, s.address, s.notes]))
    } else {
      exportCsv('purchases.csv', ['ID', 'Supplier', 'Date', 'Items', 'Total', 'Payment', 'Received'], purchases.map((p) => [p.id.slice(-6), p.supplier_name, p.purchase_date, p.item_count, p.total, p.payment_status, p.received ? 'yes' : 'no']))
    }
    toast('success', 'Exported')
  }

  return (
    <>
      <PageHeader
        title="Suppliers & Purchases"
        subtitle="Receiving a purchase adds stock exactly once — editing it never doubles up"
        actions={
          <>
            <button className="btn-secondary" onClick={doExport}>
              <FileDown size={15} /> CSV
            </button>
            {tab === 'purchases' ? (
              <button className="btn-primary" onClick={() => { setPurEdit(null); setPurOpen(true) }}>
                <Plus size={15} /> New purchase
              </button>
            ) : (
              <button className="btn-primary" onClick={() => { setSupEdit(null); setSupOpen(true) }}>
                <Plus size={15} /> New supplier
              </button>
            )}
          </>
        }
      />

      <div className="flex gap-1.5 mb-5 no-print">
        {(['purchases', 'suppliers'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`h-9 px-4 rounded-xl text-[13px] font-medium transition ${
              tab === t ? 'bg-pink-400 text-white' : 'bg-white border border-line text-muted hover:text-ink'
            }`}
          >
            {t === 'purchases' ? `Purchases (${purchases.length})` : `Suppliers (${suppliers.length})`}
          </button>
        ))}
        <div className="ml-auto w-full sm:w-64">
          <SearchInput value={search} onChange={setSearch} placeholder="Search…" />
        </div>
      </div>

      {tab === 'purchases' ? (
        <>
          {pending.length > 0 && (
            <Card className="p-4 mb-4 border-l-4 border-l-warn">
              <p className="text-[13px] text-ink font-medium">
                {pending.length} purchase{pending.length === 1 ? '' : 's'} waiting to be received
              </p>
              <p className="text-[12.5px] text-muted mt-0.5">Stock only increases when you press “Receive”.</p>
            </Card>
          )}

          <Card className="p-0">
            {purchases.length === 0 ? (
              <EmptyState
                title="No purchases yet"
                description="Record what you bought from a supplier, then receive it to add the stock."
                icon={<PackageOpen size={26} />}
                action={<button className="btn-primary" onClick={() => { setPurEdit(null); setPurOpen(true) }}><Plus size={15} /> New purchase</button>}
              />
            ) : (
              <TableWrap>
                <THead cols={['Supplier', 'Date', 'Items', 'Total', 'Payment', 'Stock', '']} />
                <tbody className="divide-y divide-line">
                  {purchases.map((p) => (
                    <tr key={p.id} className="hover:bg-pale">
                      <td className="td font-medium">{p.supplier_name || '—'}</td>
                      <td className="td tnum text-[12.5px]">{formatDisplayDate(p.purchase_date, getDateFormat())}</td>
                      <td className="td tnum">{p.item_count}</td>
                      <td className="td tnum font-medium">{formatMoney(p.total)}</td>
                      <td className="td"><Badge tone={p.payment_status === 'Paid' ? 'success' : p.payment_status === 'Partial' ? 'warning' : 'neutral'}>{p.payment_status}</Badge></td>
                      <td className="td">
                        {p.received ? (
                          <Badge tone="success"><CheckCircle2 size={11} /> received</Badge>
                        ) : (
                          <button
                            className="btn-primary !h-8 !px-3 !text-[12.5px]"
                            onClick={() => {
                              try {
                                receivePurchase(p.id)
                                toast('success', 'Purchase received', 'Stock was increased — once, and recorded in the ledger.')
                              } catch (e) {
                                toast('error', 'Could not receive', e instanceof Error ? e.message : String(e))
                              }
                            }}
                          >
                            <PackageCheck size={14} /> Receive
                          </button>
                        )}
                      </td>
                      <td className="td text-right whitespace-nowrap no-print">
                        <button className="btn-ghost !h-8 !px-2" onClick={() => { setPurEdit(p.id); setPurOpen(true) }}>
                          <Pencil size={15} />
                        </button>
                        <button className="btn-ghost !h-8 !px-2" onClick={() => setToDelete({ kind: 'pur', id: p.id })}>
                          <Trash2 size={15} className="text-bad" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </TableWrap>
            )}
          </Card>
        </>
      ) : (
        <Card className="p-0">
          {suppliers.length === 0 ? (
            <EmptyState
              title="No suppliers yet"
              description="Keep supplier contacts and prices together so you can compare costs later."
              icon={<Truck size={26} />}
              action={<button className="btn-primary" onClick={() => { setSupEdit(null); setSupOpen(true) }}><Plus size={15} /> Add supplier</button>}
            />
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
              {suppliers.map((s) => {
                const stats = query<{ c: number; t: number | null }>(
                  'SELECT COUNT(*) AS c, SUM(total) AS t FROM purchases WHERE supplier_id = ?',
                  [s.id]
                )[0]
                return (
                  <Card key={s.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[14.5px] truncate">{s.name}</p>
                        {s.contact_person && <p className="text-[12px] text-muted">{s.contact_person}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button className="btn-ghost !h-8 !px-2" onClick={() => { setSupEdit(s.id); setSupOpen(true) }}><Pencil size={15} /></button>
                        <button className="btn-ghost !h-8 !px-2" onClick={() => setSupDelete(s.id)}><Trash2 size={15} className="text-bad" /></button>
                      </div>
                    </div>
                    <div className="mt-3 space-y-1 text-[12.5px] text-muted">
                      {s.phone && <p className="inline-flex items-center gap-1.5"><Phone size={12} /> {s.phone}</p>}
                      {s.address && <p className="inline-flex items-center gap-1.5"><MapPin size={12} /> {s.address}</p>}
                    </div>
                    <div className="mt-3 pt-3 border-t border-line flex justify-between text-[12.5px]">
                      <span className="text-muted">Purchases <b className="text-ink tnum ml-1">{stats?.c ?? 0}</b></span>
                      <span className="text-muted">Spent <b className="text-ink tnum ml-1">{formatMoney(stats?.t ?? 0)}</b></span>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </Card>
      )}

      <SupplierModal open={supOpen} supplierId={supEdit} onClose={() => setSupOpen(false)} onSaved={() => { setSupOpen(false); toast('success', supEdit ? 'Supplier updated' : 'Supplier added') }} />
      <PurchaseModal open={purOpen} purchaseId={purEdit} onClose={() => setPurOpen(false)} onSaved={() => { setPurOpen(false); toast('success', purEdit ? 'Purchase updated' : 'Purchase recorded') }} />

      <Confirm
        open={!!supDelete}
        title="Delete this supplier?"
        message="Purchases keep their supplier name, so your history stays readable."
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          if (supDelete) deleteSupplier(supDelete)
          toast('success', 'Supplier deleted')
          setSupDelete(null)
        }}
        onCancel={() => setSupDelete(null)}
      />
      <Confirm
        open={!!toDelete}
        title="Delete this purchase?"
        message={
          <>
            If it was already received, the stock it added is reversed with a correction entry so your inventory stays accurate.
            History is never erased silently.
          </>
        }
        danger
        confirmLabel="Delete purchase"
        onConfirm={() => {
          try {
            if (toDelete) deletePurchase(toDelete.id)
            toast('success', 'Purchase deleted')
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

/* ================================ Supplier modal ================================ */

function SupplierModal({ open, supplierId, onClose, onSaved }: { open: boolean; supplierId: string | null; onClose: () => void; onSaved: () => void }) {
  const existing = useLive(() => (open && supplierId ? listSuppliers().find((s) => s.id === supplierId) : undefined), [open, supplierId])
  const [form, setForm] = useState({ name: '', contact_person: '', phone: '', email: '', address: '', notes: '' })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setError('')
    setForm(
      existing
        ? { name: existing.name, contact_person: existing.contact_person, phone: existing.phone, email: existing.email, address: existing.address, notes: existing.notes }
        : { name: '', contact_person: '', phone: '', email: '', address: '', notes: '' }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplierId])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const submit = () => {
    if (!form.name.trim()) {
      setError('Supplier name is required.')
      return
    }
    try {
      if (supplierId) updateSupplier(supplierId, form)
      else createSupplier(form)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={supplierId ? 'Edit supplier' : 'New supplier'}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>{supplierId ? 'Save changes' : 'Add supplier'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Supplier name" required>
          <TextInput autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Sunrise Wholesale" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Contact person"><TextInput value={form.contact_person} onChange={(e) => set('contact_person', e.target.value)} /></Field>
          <Field label="Phone"><TextInput value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="Email"><TextInput value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Address"><TextInput value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
        </div>
        <Field label="Notes"><TextArea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Delivery days, minimum order…" /></Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

/* ================================ Purchase modal ================================ */

interface PItem extends PurchaseDraftItem {
  key: number
}
let pKey = 1

function PurchaseModal({ open, purchaseId, onClose, onSaved }: { open: boolean; purchaseId: string | null; onClose: () => void; onSaved: () => void }) {
  const toast = useApp((s) => s.toast)
  const suppliers = useLive(() => (open ? listSuppliers() : []), [open])
  const ingredients = useLive(() => (open ? listIngredients() : []), [open])
  const existing = useLive(() => (open && purchaseId ? listPurchases().find((p) => p.id === purchaseId) : undefined), [open, purchaseId])

  const [form, setForm] = useState({ supplier_id: '', supplier_name: '', purchase_date: todayKey(), payment_status: 'Unpaid', notes: '' })
  const [items, setItems] = useState<PItem[]>([])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setError('')
    if (existing) {
      setForm({
        supplier_id: existing.supplier_id ?? '',
        supplier_name: existing.supplier_name,
        purchase_date: existing.purchase_date,
        payment_status: existing.payment_status,
        notes: existing.notes,
      })
      setItems(
        getPurchaseItems(existing.id).map((i) => ({
          key: pKey++,
          ingredient_id: i.ingredient_id,
          ingredient_name: i.ingredient_name,
          quantity: i.quantity,
          unit: i.unit,
          unit_price: i.unit_price,
        }))
      )
    } else {
      setForm({ supplier_id: '', supplier_name: '', purchase_date: todayKey(), payment_status: 'Unpaid', notes: '' })
      setItems([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchaseId])

  const total = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0)

  const addItem = () => {
    setItems((ls) => [...ls, { key: pKey++, ingredient_id: null, ingredient_name: '', quantity: 1, unit: 'g', unit_price: 0 }])
  }

  const submit = async () => {
    setError('')
    if (!items.length) {
      setError('Add at least one item.')
      return
    }
    for (const i of items) {
      if (!i.ingredient_id) {
        setError('Choose an ingredient for every row.')
        return
      }
      if (!(i.quantity > 0)) {
        setError('Quantities must be greater than zero.')
        return
      }
    }
    setSaving(true)
    const supplier = suppliers.find((s) => s.id === form.supplier_id)
    try {
      const payload = {
        supplier_id: form.supplier_id || null,
        supplier_name: supplier?.name ?? form.supplier_name,
        purchase_date: form.purchase_date,
        payment_status: form.payment_status,
        notes: form.notes,
        items: items.map(({ key, ...rest }) => rest),
      }
      if (purchaseId) {
        updatePurchase(purchaseId, payload)
        toast('success', 'Purchase updated', 'Stock was corrected by the difference — never added twice.')
      } else {
        createPurchase({ ...payload, received: false })
        toast('success', 'Purchase saved', 'Press Receive when the goods arrive to add stock.')
      }
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
      title={purchaseId ? 'Edit purchase' : 'New purchase'}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : purchaseId ? 'Save changes' : 'Save purchase'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Supplier">
            <SelectInput value={form.supplier_id} onChange={(e) => setForm((f) => ({ ...f, supplier_id: e.target.value }))}>
              <option value="">— None —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Purchase date">
            <TextInput type="date" value={form.purchase_date} onChange={(e) => setForm((f) => ({ ...f, purchase_date: e.target.value }))} />
          </Field>
          <Field label="Payment status">
            <SelectInput value={form.payment_status} onChange={(e) => setForm((f) => ({ ...f, payment_status: e.target.value }))}>
              <option>Unpaid</option>
              <option>Partial</option>
              <option>Paid</option>
            </SelectInput>
          </Field>
        </div>

        <div className="rounded-xl border border-line overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-warm border-b border-line">
            <p className="text-[12.5px] font-semibold">Items</p>
            <button className="btn-secondary !h-8 !px-2.5 !text-[12.5px]" onClick={addItem}>
              <Plus size={13} /> Add item
            </button>
          </div>

          {items.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted text-center">No items yet.</p>
          ) : (
            <div className="divide-y divide-line">
              {items.map((it, idx) => (
                <div key={it.key} className="grid grid-cols-12 gap-2 items-end p-3">
                  <div className="col-span-12 sm:col-span-4">
                    <SelectInput
                      className="!h-9"
                      value={it.ingredient_id ?? ''}
                      onChange={(e) => {
                        const ing = ingredients.find((x) => x.id === e.target.value)
                        setItems((ls) =>
                          ls.map((x, j) =>
                            j === idx
                              ? { ...x, ingredient_id: e.target.value || null, ingredient_name: ing?.name ?? x.ingredient_name, unit: ing?.purchase_unit ?? x.unit }
                              : x
                          )
                        )
                      }}
                    >
                      <option value="">Choose ingredient…</option>
                      {ingredients.map((x) => (
                        <option key={x.id} value={x.id}>{x.name}</option>
                      ))}
                    </SelectInput>
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className="label !mb-1 !text-[11px]">Qty</label>
                    <TextInput className="!h-9 tnum" type="number" min={0} step="any" value={it.quantity} onChange={(e) => setItems((ls) => ls.map((x, j) => (j === idx ? { ...x, quantity: Number(e.target.value) } : x)))} />
                  </div>
                  <div className="col-span-3 sm:col-span-2">
                    <label className="label !mb-1 !text-[11px]">Unit</label>
                    <TextInput className="!h-9" value={it.unit} onChange={(e) => setItems((ls) => ls.map((x, j) => (j === idx ? { ...x, unit: e.target.value } : x)))} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <label className="label !mb-1 !text-[11px]">Unit price</label>
                    <TextInput className="!h-9 tnum" type="number" min={0} step="0.0001" value={it.unit_price} onChange={(e) => setItems((ls) => ls.map((x, j) => (j === idx ? { ...x, unit_price: Number(e.target.value) } : x)))} />
                  </div>
                  <div className="col-span-1 sm:col-span-1 tnum text-[13px] font-medium">{formatMoney(it.quantity * it.unit_price)}</div>
                  <div className="col-span-1 flex justify-end">
                    <button className="btn-ghost !h-8 !px-2" onClick={() => setItems((ls) => ls.filter((_, j) => j !== idx))}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="px-4 py-3 bg-pale border-t border-line flex justify-between text-[14px] font-semibold">
            <span>Total</span>
            <span className="tnum">{formatMoney(total)}</span>
          </div>
        </div>

        <Field label="Notes">
          <TextArea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Invoice number, delivery notes…" />
        </Field>

        <p className="hint">
          Saving a purchase does not change stock. Use <b>Receive</b> in the list after the goods arrive — it adds stock exactly
          once. Editing a received purchase records a correction for the difference.
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
