import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Eye, Copy, XCircle, Archive, Trash2, Printer, Filter, FileDown } from 'lucide-react'
import {
  PageHeader, Card, SearchInput, Badge, STATUS_TONE, EmptyState, Modal, Field, TextInput, SelectInput, TextArea,
  TableWrap, THead, Confirm, ErrorNote, Money,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import {
  listOrders, createOrder, updateOrder, getOrderItems, duplicateOrder, archiveOrder, deleteOrder, setOrderStatus,
  nextOrderNumberPreview, type OrderDraftItem,
} from '../repositories/orders'
import { listCustomers } from '../repositories/catalog'
import { productCatalogForOrder } from '../repositories/orders'
import { getSettings } from '../repositories/settings'
import { formatDisplayDate, todayKey, addDays } from '../lib/dates'
import { getDateFormat } from '../lib/format'
import { formatMoney } from '../lib/format'
import { round2 } from '../lib/money'
import { computeOrderTotals } from '../lib/calc'
import { exportCsv } from '../lib/exporters'
import { ORDER_STATUSES, PAYMENT_STATUSES, type Order } from '../types'

const schema = z.object({
  customer_id: z.string().optional(),
  customer_name: z.string().optional(),
  due_date: z.string().min(1, 'Delivery or pickup date is required'),
  due_time: z.string().optional(),
  order_type: z.string(),
  status: z.string(),
  discount: z.coerce.number().min(0).optional(),
  tax_rate: z.coerce.number().min(0).optional(),
  delivery_fee: z.coerce.number().min(0).optional(),
  special_instructions: z.string().optional(),
  customer_notes: z.string().optional(),
  internal_notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export function OrdersPage() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [payment, setPayment] = useState('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [confirm, setConfirm] = useState<{ kind: 'cancel' | 'archive' | 'delete'; order: Order } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (params.get('new') === '1') setEditorOpen(true)
    const s = params.get('status')
    if (s) setStatus(s)
    const p = params.get('payment')
    if (p) setPayment(p)
    if (params.get('new') || s || p) {
      params.delete('new')
      params.delete('status')
      params.delete('payment')
      setParams(params, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const orders = useLive(
    () => listOrders({ search, status, paymentStatus: payment, from: to ? undefined : from, to, includeArchived }),
    [search, status, payment, from, to, includeArchived]
  )

  const totals = useMemo(
    () => ({
      value: round2(orders.reduce((s, o) => s + (o.status === 'Cancelled' ? 0 : o.total), 0)),
      paid: round2(orders.reduce((s, o) => s + (o.status === 'Cancelled' ? 0 : o.amount_paid), 0)),
      due: round2(orders.reduce((s, o) => s + (o.status === 'Cancelled' ? 0 : o.outstanding), 0)),
    }),
    [orders]
  )

  const doExport = () => {
    exportCsv(
      'orders.csv',
      ['Order #', 'Customer', 'Created', 'Due', 'Type', 'Status', 'Payment status', 'Total', 'Paid', 'Outstanding', 'Items'],
      orders.map((o) => [
        o.order_no, o.customer_name, o.created_at.slice(0, 10), o.due_date ?? '', o.order_type, o.status,
        o.payment_status, o.total, o.amount_paid, o.outstanding, o.item_count,
      ])
    )
    toast('success', 'Orders exported', 'CSV saved to your downloads folder.')
  }

  const runConfirm = () => {
    if (!confirm) return
    setBusy(true)
    try {
      if (confirm.kind === 'cancel') {
        setOrderStatus(confirm.order.id, 'Cancelled')
        toast('success', 'Order cancelled', `${confirm.order.order_no} is now cancelled. Payments and history are kept.`)
      } else if (confirm.kind === 'archive') {
        archiveOrder(confirm.order.id, true)
        toast('success', 'Order archived', 'You can find it again by ticking “Include archived”.')
      } else {
        deleteOrder(confirm.order.id)
        toast('success', 'Order deleted', 'Only orders with no payments or production history can be deleted.')
      }
      setConfirm(null)
    } catch (e) {
      toast('error', 'Could not complete', e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const filtersActive = !!(search || status !== 'All' || payment !== 'All' || from || to)

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle={`${orders.length} order${orders.length === 1 ? '' : 's'} shown`}
        actions={
          <>
            <button className="btn-secondary" onClick={doExport}>
              <FileDown size={15} /> Export CSV
            </button>
            <button className="btn-primary" onClick={() => setEditorOpen(true)}>
              <Plus size={15} /> New order
            </button>
          </>
        }
      />

      <Card className="p-4 mb-5 no-print">
        <div className="flex flex-wrap gap-2.5 items-end">
          <SearchInput value={search} onChange={setSearch} placeholder="Order #, customer, product…" className="w-full sm:w-64" />
          <div>
            <label className="label !mb-1">Status</label>
            <SelectInput className="!w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option>All</option>
              {ORDER_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="label !mb-1">Payment</label>
            <SelectInput className="!w-auto" value={payment} onChange={(e) => setPayment(e.target.value)}>
              <option>All</option>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </SelectInput>
          </div>
          <div>
            <label className="label !mb-1">Due from</label>
            <TextInput type="date" className="!w-auto" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="label !mb-1">Due to</label>
            <TextInput type="date" className="!w-auto" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-[13px] text-muted pb-2.5 cursor-pointer">
            <input type="checkbox" className="accent-[#E35683]" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
            Include archived
          </label>
          {filtersActive && (
            <button
              className="btn-ghost pb-2.5"
              onClick={() => {
                setSearch('')
                setStatus('All')
                setPayment('All')
                setFrom('')
                setTo('')
              }}
            >
              <Filter size={14} /> Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-5 mt-3.5 pt-3.5 border-t border-line text-[12.5px]">
          <span className="text-muted">
            Order value <b className="text-ink ml-1 tnum">{formatMoney(totals.value)}</b>
          </span>
          <span className="text-muted">
            Received <b className="text-ok ml-1 tnum">{formatMoney(totals.paid)}</b>
          </span>
          <span className="text-muted">
            Outstanding <b className="text-warn ml-1 tnum">{formatMoney(totals.due)}</b>
          </span>
        </div>
      </Card>

      <Card className="p-0">
        {orders.length === 0 ? (
          <EmptyState
            title={filtersActive ? 'No orders match these filters' : 'No orders yet'}
            description={
              filtersActive
                ? 'Try clearing the search or filters.'
                : 'Create your first order — it will not touch inventory until you record production.'
            }
            icon={<Plus size={26} />}
            action={
              !filtersActive && (
                <button className="btn-primary" onClick={() => setEditorOpen(true)}>
                  <Plus size={15} /> Create order
                </button>
              )
            }
          />
        ) : (
          <TableWrap>
            <THead cols={['Order', 'Customer', 'Due', 'Items', 'Status', 'Payment', 'Total', 'Outstanding', '']} />
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-pale">
                  <td className="td">
                    <Link to={`/orders/${o.id}`} className="font-medium text-ink hover:text-pink-600">
                      {o.order_no}
                    </Link>
                    {o.archived_at && <span className="ml-2 text-[10.5px] text-muted">archived</span>}
                  </td>
                  <td className="td">
                    <span className="block max-w-[190px] truncate">{o.customer_name || '—'}</span>
                    <span className="text-[11.5px] text-muted capitalize">{o.order_type}</span>
                  </td>
                  <td className="td">
                    <span className="tnum block">{o.due_date ? formatDisplayDate(o.due_date, getDateFormat()) : '—'}</span>
                    {o.due_time && <span className="text-[11.5px] text-muted">{o.due_time}</span>}
                  </td>
                  <td className="td tnum text-muted">{o.item_count}</td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
                  </td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[o.payment_status] ?? 'neutral'}>{o.payment_status}</Badge>
                  </td>
                  <td className="td tnum font-medium">{formatMoney(o.total)}</td>
                  <td className={`td tnum ${o.outstanding > 0 ? 'text-warn font-medium' : 'text-muted'}`}>{formatMoney(o.outstanding)}</td>
                  <td className="td text-right whitespace-nowrap no-print">
                    <div className="inline-flex items-center gap-1">
                      <Link to={`/orders/${o.id}`} className="btn-ghost !h-8 !px-2" title="Open">
                        <Eye size={15} />
                      </Link>
                      <button
                        className="btn-ghost !h-8 !px-2"
                        title="Duplicate"
                        onClick={() => {
                          try {
                            duplicateOrder(o.id, getSettings())
                            toast('success', 'Order duplicated', 'A new draft order was created.')
                          } catch (e) {
                            toast('error', 'Could not duplicate', e instanceof Error ? e.message : String(e))
                          }
                        }}
                      >
                        <Copy size={15} />
                      </button>
                      <button className="btn-ghost !h-8 !px-2" title="Cancel order" onClick={() => setConfirm({ kind: 'cancel', order: o })}>
                        <XCircle size={15} />
                      </button>
                      <button
                        className="btn-ghost !h-8 !px-2"
                        title={o.archived_at ? 'Restore' : 'Archive'}
                        onClick={() => setConfirm({ kind: 'archive', order: o })}
                      >
                        <Archive size={15} />
                      </button>
                      <button className="btn-ghost !h-8 !px-2" title="Delete" onClick={() => setConfirm({ kind: 'delete', order: o })}>
                        <Trash2 size={15} className="text-bad" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <OrderEditor
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        onSaved={(id) => {
          setEditorOpen(false)
          toast('success', 'Order saved', 'Inventory is untouched until production is recorded.')
          nav(`/orders/${id}`)
        }}
      />

      <Confirm
        open={!!confirm}
        title={
          confirm?.kind === 'cancel' ? 'Cancel this order?' : confirm?.kind === 'archive' ? 'Archive this order?' : 'Delete this order?'
        }
        message={
          confirm?.kind === 'cancel' ? (
            <>
              <b>{confirm?.order.order_no}</b> will be marked cancelled. Recorded payments and any production history are kept
              exactly as they are.
            </>
          ) : confirm?.kind === 'archive' ? (
            <>
              <b>{confirm?.order.order_no}</b> will be hidden from the default list. Nothing is deleted.
            </>
          ) : (
            <>
              Orders with payments or production batches cannot be deleted — this protects your financial and inventory history.
              You can archive instead.
            </>
          )
        }
        danger={confirm?.kind !== 'archive'}
        confirmLabel={confirm?.kind === 'archive' ? 'Archive' : confirm?.kind === 'cancel' ? 'Cancel order' : 'Delete'}
        busy={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}

/* ================================ Editor ================================ */

interface Line extends OrderDraftItem {
  key: number
}

let lineKey = 1

function OrderEditor({
  open,
  onClose,
  onSaved,
  order,
}: {
  open: boolean
  onClose: () => void
  onSaved: (id: string) => void
  order?: Order | null
}) {
  const settings = useApp((s) => s.settings)
  const toast = useApp((s) => s.toast)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const customers = useLive(() => listCustomers(), [])
  const catalog = useLive(() => (open ? productCatalogForOrder() : []), [open])

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_id: '',
      customer_name: '',
      due_date: addDays(todayKey(), settings?.default_lead_time_days ?? 3),
      due_time: '16:00',
      order_type: 'pickup',
      status: 'Confirmed',
      discount: 0,
      tax_rate: settings?.default_tax_rate ?? 0,
      delivery_fee: 0,
      special_instructions: '',
      customer_notes: '',
      internal_notes: '',
    },
  })

  const [lines, setLines] = useState<Line[]>([])

  useEffect(() => {
    if (!open) return
    setError('')
    if (order) {
      reset({
        customer_id: order.customer_id ?? '',
        customer_name: order.customer_name,
        due_date: order.due_date ?? addDays(todayKey(), 3),
        due_time: order.due_time,
        order_type: order.order_type,
        status: order.status,
        discount: order.discount,
        tax_rate: order.tax_rate,
        delivery_fee: order.delivery_fee,
        special_instructions: order.special_instructions,
        customer_notes: order.customer_notes,
        internal_notes: order.internal_notes,
      })
      setLines(getOrderItems(order.id).map((i) => ({ key: lineKey++, ...i })))
    } else {
      reset({
        customer_id: '',
        customer_name: '',
        due_date: addDays(todayKey(), settings?.default_lead_time_days ?? 3),
        due_time: '16:00',
        order_type: 'pickup',
        status: 'Confirmed',
        discount: 0,
        tax_rate: settings?.default_tax_rate ?? 0,
        delivery_fee: 0,
        special_instructions: '',
        customer_notes: '',
        internal_notes: '',
      })
      setLines([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, order?.id])

  const subtotal = round2(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0))
  const totals = computeOrderTotals({
    subtotal,
    discount: Number(watch('discount') ?? 0),
    tax_rate: Number(watch('tax_rate') ?? 0),
    delivery_fee: Number(watch('delivery_fee') ?? 0),
  })

  const addLine = (productId?: string) => {
    const p = productId ? catalog.find((c) => c.id === productId) : undefined
    setLines((ls) => [
      ...ls,
      {
        key: lineKey++,
        product_id: p?.id ?? null,
        product_name: p?.name ?? '',
        recipe_id: p?.recipe_id ?? null,
        unit_price: p ? p.selling_price : 0,
        quantity: 1,
        customization: '',
      },
    ])
  }

  const addCustom = () => {
    setLines((ls) => [
      ...ls,
      { key: lineKey++, product_id: null, product_name: '', recipe_id: null, unit_price: 0, quantity: 1, customization: '' },
    ])
  }

  const onPick = (key: number, value: string) => {
    if (value === '__custom') {
      setLines((ls) => ls.map((l) => (l.key === key ? { ...l, product_id: null, product_name: '', recipe_id: null, unit_price: 0 } : l)))
      return
    }
    const p = catalog.find((c) => c.id === value)
    if (!p) return
    setLines((ls) =>
      ls.map((l) =>
        l.key === key
          ? { ...l, product_id: p.id, product_name: p.name, recipe_id: p.recipe_id, unit_price: p.selling_price }
          : l
      )
    )
  }

  const submit = handleSubmit(async (values) => {
    setError('')
    if (!lines.length) {
      setError('Add at least one product to this order.')
      return
    }
    for (const l of lines) {
      if (!l.product_name.trim()) {
        setError('Every line needs a product name.')
        return
      }
      if (!(l.quantity > 0)) {
        setError(`Quantity for ${l.product_name || 'an item'} must be at least 1.`)
        return
      }
    }
    const customerId = values.customer_id || null
    const customerName = values.customer_name?.trim() || customers.find((c) => c.id === customerId)?.name || ''
    setSaving(true)
    try {
      const draft = {
        customer_id: customerId,
        customer_name: customerName,
        due_date: values.due_date,
        due_time: values.due_time ?? '',
        order_type: values.order_type,
        status: values.status as never,
        discount: Number(values.discount) || 0,
        tax_rate: Number(values.tax_rate) || 0,
        delivery_fee: Number(values.delivery_fee) || 0,
        special_instructions: values.special_instructions ?? '',
        customer_notes: values.customer_notes ?? '',
        internal_notes: values.internal_notes ?? '',
        items: lines.map(({ key, ...rest }) => rest),
      }
      const result = order ? (updateOrder(order.id, draft), order.id) : createOrder(draft, settings!).id
      onSaved(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={order ? `Edit ${order.order_no}` : `New order · ${nextOrderNumberPreview()}`}
      size="lg"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving…' : order ? 'Save changes' : 'Create order'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Customer">
            <SelectInput {...register('customer_id')}>
              <option value="">— Walk-in / not listed —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Customer name" hint="Used when no customer is selected, or to override.">
            <TextInput {...register('customer_name')} placeholder="Walk-in customer" />
          </Field>
          <Field label="Delivery / pickup date" required error={errors.due_date?.message}>
            <TextInput type="date" {...register('due_date')} />
          </Field>
          <Field label="Time">
            <TextInput type="time" {...register('due_time')} />
          </Field>
          <Field label="Order type">
            <SelectInput {...register('order_type')}>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
              <option value="event">Event</option>
            </SelectInput>
          </Field>
          <Field label="Order status">
            <SelectInput {...register('status')}>
              {ORDER_STATUSES.filter((s) => s !== 'Cancelled').map((s) => (
                <option key={s}>{s}</option>
              ))}
            </SelectInput>
          </Field>
        </div>

        {/* line items */}
        <div className="rounded-xl border border-line overflow-hidden">
          <div className="flex items-center justify-between px-3.5 py-2.5 bg-warm border-b border-line">
            <p className="text-[12.5px] font-semibold text-ink">Products</p>
            <div className="flex gap-1.5">
              <select className="input !h-8 !w-auto !text-[12.5px]" value="" onChange={(e) => e.target.value && addLine(e.target.value)}>
                <option value="">+ Add product…</option>
                {catalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.selling_price)}
                  </option>
                ))}
              </select>
              <button className="btn-secondary !h-8 !px-2.5 !text-[12.5px]" onClick={addCustom}>
                Custom item
              </button>
            </div>
          </div>

          {lines.length === 0 ? (
            <p className="px-4 py-6 text-[13px] text-muted text-center">No products yet — add one above.</p>
          ) : (
            <div className="divide-y divide-line">
              {lines.map((l) => (
                <div key={l.key} className="grid grid-cols-12 gap-2 items-end p-3">
                  <div className="col-span-12 sm:col-span-5">
                    {l.product_id !== null || !l.product_name ? (
                      <SelectInput className="!h-9" value={l.product_id ?? '__custom'} onChange={(e) => onPick(l.key, e.target.value)}>
                        <option value="">Choose product…</option>
                        {catalog.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                        <option value="__custom">Custom / manual item</option>
                      </SelectInput>
                    ) : (
                      <TextInput
                        className="!h-9"
                        value={l.product_name}
                        placeholder="Item name"
                        onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, product_name: e.target.value } : x)))}
                      />
                    )}
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <label className="label !mb-1 !text-[11px]">Qty</label>
                    <TextInput
                      className="!h-9"
                      type="number"
                      min={1}
                      step="1"
                      value={l.quantity}
                      onChange={(e) =>
                        setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: Math.max(0, Number(e.target.value)) } : x)))
                      }
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <label className="label !mb-1 !text-[11px]">Price</label>
                    <TextInput
                      className="!h-9 tnum"
                      type="number"
                      min={0}
                      step="0.01"
                      value={l.unit_price}
                      onChange={(e) =>
                        setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, unit_price: Number(e.target.value) } : x)))
                      }
                    />
                  </div>
                  <div className="col-span-9 sm:col-span-2">
                    <label className="label !mb-1 !text-[11px]">Customization</label>
                    <TextInput
                      className="!h-9"
                      value={l.customization}
                      placeholder="e.g. “no nuts”"
                      onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, customization: e.target.value } : x)))}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-1 flex items-center justify-between gap-1">
                    <span className="tnum text-[13px] font-medium">{formatMoney(l.unit_price * l.quantity)}</span>
                    <button
                      className="btn-ghost !h-8 !px-1.5"
                      title="Remove line"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Discount">
            <TextInput type="number" min={0} step="0.01" className="tnum" {...register('discount')} />
          </Field>
          <Field label="Tax rate %">
            <TextInput type="number" min={0} step="0.01" className="tnum" {...register('tax_rate')} />
          </Field>
          <Field label="Delivery fee">
            <TextInput type="number" min={0} step="0.01" className="tnum" {...register('delivery_fee')} />
          </Field>
        </div>

        <div className="rounded-xl bg-pale border border-line p-4 space-y-1.5 text-[13px]">
          <Row label="Subtotal" value={formatMoney(totals.subtotal)} />
          {totals.discount > 0 && <Row label="Discount" value={`− ${formatMoney(totals.discount)}`} />}
          {totals.tax_amount > 0 && <Row label={`Tax (${totals.tax_rate}%)`} value={formatMoney(totals.tax_amount)} />}
          {totals.delivery_fee > 0 && <Row label="Delivery fee" value={formatMoney(totals.delivery_fee)} />}
          <div className="flex justify-between pt-2 border-t border-line font-semibold text-[15px]">
            <span>Total</span>
            <span className="tnum">{formatMoney(totals.total)}</span>
          </div>
          <p className="text-[11.5px] text-muted pt-1">
            Creating this order does <b>not</b> reduce stock. Inventory changes only when production is recorded.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Special instructions">
            <TextArea rows={2} {...register('special_instructions')} placeholder="e.g. Write “Happy Birthday Aisha”" />
          </Field>
          <Field label="Customer notes">
            <TextArea rows={2} {...register('customer_notes')} placeholder="Allergies, preferences…" />
          </Field>
          <Field label="Internal notes">
            <TextArea rows={2} {...register('internal_notes')} placeholder="Only you see this" />
          </Field>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="tnum text-ink">{value}</span>
    </div>
  )
}

export { OrderEditor }
