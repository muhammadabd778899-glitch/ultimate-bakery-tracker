import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft, Pencil, Printer, Copy, Factory, HandCoins, Undo2, Trash2, Archive, FileDown,
} from 'lucide-react'
import {
  PageHeader, Card, Badge, STATUS_TONE, EmptyState, Modal, Field, TextInput, SelectInput, TextArea,
  TableWrap, THead, ErrorNote, Confirm, Money,
} from '../components/ui'
import { OrderEditor } from './Orders'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import {
  getOrder, getOrderItems, getOrderPayments, recordPayment, voidPayment, duplicateOrder, setOrderStatus, archiveOrder,
  orderTimeline,
} from '../repositories/orders'
import { createBatchesFromOrder, productionCandidates } from '../repositories/production'
import { getSettings } from '../repositories/settings'
import { formatDisplayDate, todayKey, relativeDay } from '../lib/dates'
import { formatMoney, getDateFormat } from '../lib/format'
import { exportCsv, exportPdf } from '../lib/exporters'
import { ORDER_STATUSES } from '../types'

export function OrderDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useApp((s) => s.toast)
  const [editing, setEditing] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [confirm, setConfirm] = useState<'cancel' | 'archive' | 'delete' | null>(null)

  const data = useLive(() => {
    const order = getOrder(id)
    if (!order) return null
    return {
      order,
      items: getOrderItems(id),
      payments: getOrderPayments(id),
      timeline: orderTimeline(id),
    }
  }, [id])

  if (!data) {
    return (
      <Card className="p-8">
        <EmptyState
          title="Order not found"
          description="It may have been deleted."
          action={
            <button className="btn-primary" onClick={() => nav('/orders')}>
              Back to orders
            </button>
          }
        />
      </Card>
    )
  }

  const { order, items, payments, timeline } = data
  const settings = getSettings()

  const act = (fn: () => void, okTitle: string, msg?: string) => {
    try {
      fn()
      toast('success', okTitle, msg)
    } catch (e) {
      toast('error', 'Could not complete', e instanceof Error ? e.message : String(e))
    }
  }

  const doPrint = () => window.print()

  const doExport = () => {
    exportCsv(
      `${order.order_no}.csv`,
      ['Order #', 'Customer', 'Due', 'Status', 'Payment status', 'Total', 'Paid', 'Outstanding'],
      [[order.order_no, order.customer_name, order.due_date ?? '', order.status, order.payment_status, order.total, order.amount_paid, order.outstanding]]
    )
    toast('success', 'Order exported', 'CSV saved to your downloads folder.')
  }

  const doPdf = () => {
    exportPdf({
      title: `Order ${order.order_no}`,
      subtitle: `${order.customer_name || 'Walk-in'} · due ${order.due_date ? formatDisplayDate(order.due_date, getDateFormat()) : '—'}`,
      table: {
        head: ['Product', 'Qty', 'Unit price', 'Total'],
        body: items.map((i) => [i.product_name, i.quantity, formatMoney(i.unit_price), formatMoney(i.line_total)]),
        foot: [['', '', 'Total', formatMoney(order.total)]],
      },
      filename: `${order.order_no}.pdf`,
    })
  }

  return (
    <>
      <div className="no-print">
        <button className="btn-ghost !px-0 mb-3" onClick={() => nav('/orders')}>
          <ArrowLeft size={15} /> All orders
        </button>
        <PageHeader
          title={`${order.order_no}`}
          subtitle={`${order.customer_name || 'Walk-in customer'} · created ${formatDisplayDate(order.created_at.slice(0, 10), getDateFormat())}`}
          actions={
            <>
              <Badge tone={STATUS_TONE[order.status] ?? 'neutral'}>{order.status}</Badge>
              <Badge tone={STATUS_TONE[order.payment_status] ?? 'neutral'}>{order.payment_status}</Badge>
              <button className="btn-secondary" onClick={() => setEditing(true)}>
                <Pencil size={15} /> Edit
              </button>
              <button
                className="btn-secondary"
                onClick={() =>
                  act(() => {
                    const o = duplicateOrder(order.id, settings)
                    if (o) nav(`/orders/${o.id}`)
                  }, 'Order duplicated')
                }
                title="Duplicate"
              >
                <Copy size={15} />
              </button>
              <button className="btn-secondary" onClick={doPrint}>
                <Printer size={15} /> Print
              </button>
              <button className="btn-secondary" onClick={doExport} title="Export CSV">
                <FileDown size={15} />
              </button>
              <button className="btn-secondary" onClick={doPdf} title="Export PDF">
                <FileDown size={15} /> PDF
              </button>
              <button className="btn-secondary" onClick={() => setConfirm('archive')}>
                <Archive size={15} />
              </button>
              <button className="btn-secondary" onClick={() => setConfirm('delete')}>
                <Trash2 size={15} className="text-bad" />
              </button>
            </>
          }
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 print-area">
        {/* left: items */}
        <div className="lg:col-span-2 space-y-5">
          <Card title="Order items" className="p-0">
            <TableWrap className="print:overflow-visible">
              <THead cols={['Product', 'Qty', 'Unit price', 'Line total', 'Customization']} />
              <tbody className="divide-y divide-line">
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="td">
                      <span className="font-medium">{i.product_name}</span>
                      {i.recipe_id && (
                        <span className="ml-2 text-[11px] text-pink-600">
                          recipe linked
                        </span>
                      )}
                    </td>
                    <td className="td tnum">{i.quantity}</td>
                    <td className="td tnum">{formatMoney(i.unit_price)}</td>
                    <td className="td tnum font-medium">{formatMoney(i.line_total)}</td>
                    <td className="td text-muted text-[12.5px]">{i.customization || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>

            <div className="px-5 py-4 bg-pale border-t border-line space-y-1.5 text-[13px] max-w-sm ml-auto">
              <Line label="Subtotal" value={formatMoney(order.subtotal)} />
              {order.discount > 0 && <Line label="Discount" value={`− ${formatMoney(order.discount)}`} />}
              {order.tax_amount > 0 && <Line label={`Tax (${order.tax_rate}%)`} value={formatMoney(order.tax_amount)} />}
              {order.delivery_fee > 0 && <Line label="Delivery fee" value={formatMoney(order.delivery_fee)} />}
              <div className="flex justify-between font-semibold text-[15px] pt-2 border-t border-line">
                <span>Order total</span>
                <span className="tnum">{formatMoney(order.total)}</span>
              </div>
              <Line label="Received" value={formatMoney(order.amount_paid)} mutedClass="text-ok" />
              <div className="flex justify-between font-medium pt-1 border-t border-line">
                <span>Outstanding</span>
                <span className={`tnum ${order.outstanding > 0 ? 'text-warn' : 'text-ok'}`}>{formatMoney(order.outstanding)}</span>
              </div>
            </div>
          </Card>

          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold mb-1.5">Delivery / pickup</p>
              <p className="text-sm">
                {order.due_date ? (
                  <>
                    {formatDisplayDate(order.due_date, getDateFormat())} {order.due_time && `at ${order.due_time}`}
                    <span className="block text-[12px] text-muted">{relativeDay(order.due_date)}</span>
                  </>
                ) : (
                  'No date set'
                )}
              </p>
              <p className="text-[12.5px] text-muted mt-1 capitalize">{order.order_type}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold mb-1.5">Status</p>
              <SelectInput
                className="!h-9"
                value={order.status}
                onChange={(e) => act(() => setOrderStatus(order.id, e.target.value as never), 'Status updated')}
              >
                {ORDER_STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </SelectInput>
              <div className="mt-2">
                <button className="btn-secondary !h-8 !text-[12.5px] w-full" onClick={() => setConfirm('cancel')} disabled={order.status === 'Cancelled'}>
                  Cancel order
                </button>
              </div>
            </Card>
            <Card className="p-4">
              <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold mb-1.5">Customer</p>
              {order.customer_id ? (
                <Link to={`/customers/${order.customer_id}`} className="text-sm text-pink-600 hover:underline font-medium">
                  {order.customer_name}
                </Link>
              ) : (
                <p className="text-sm">{order.customer_name || 'Walk-in customer'}</p>
              )}
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                <button className="btn-secondary !h-8 !text-[12.5px]" onClick={() => setPayOpen(true)}>
                  <HandCoins size={14} /> Record payment
                </button>
                <button className="btn-primary !h-8 !text-[12.5px]" onClick={() => setPlanOpen(true)}>
                  <Factory size={14} /> Plan production
                </button>
              </div>
            </Card>
          </div>

          {(order.special_instructions || order.customer_notes || order.internal_notes) && (
            <Card title="Notes" className="p-5">
              <div className="grid sm:grid-cols-3 gap-4 text-[13px]">
                <div>
                  <p className="text-[11.5px] text-muted font-semibold uppercase tracking-wide mb-1">Special instructions</p>
                  <p className="whitespace-pre-wrap">{order.special_instructions || '—'}</p>
                </div>
                <div>
                  <p className="text-[11.5px] text-muted font-semibold uppercase tracking-wide mb-1">Customer notes</p>
                  <p className="whitespace-pre-wrap">{order.customer_notes || '—'}</p>
                </div>
                <div>
                  <p className="text-[11.5px] text-muted font-semibold uppercase tracking-wide mb-1">Internal notes</p>
                  <p className="whitespace-pre-wrap">{order.internal_notes || '—'}</p>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* right: payments + timeline */}
        <div className="space-y-5">
          <Card title="Payments" action={<button className="text-[12.5px] text-pink-600 hover:underline" onClick={() => setPayOpen(true)}>+ Record</button>}>
            {payments.length === 0 ? (
              <EmptyState title="Nothing paid yet" description="Deposits and payments appear here." icon={<HandCoins size={24} />} />
            ) : (
              <div className="divide-y divide-line">
                {payments.map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium capitalize">
                        {p.type === 'refund' ? 'Refund' : p.type === 'deposit' ? 'Deposit' : 'Payment'}{' '}
                        <span className="text-muted font-normal">· {p.method}</span>
                      </p>
                      <p className="text-[11.5px] text-muted">
                        {formatDisplayDate(p.paid_at, getDateFormat())}
                        {p.notes && ` · ${p.notes}`}
                      </p>
                    </div>
                    <span className={`tnum text-[14px] font-medium ${p.type === 'refund' ? 'text-bad' : 'text-ok'}`}>
                      {p.type === 'refund' ? '−' : ''}
                      {formatMoney(p.amount)}
                    </span>
                    <button
                      className="text-muted hover:text-bad"
                      title="Void this record"
                      onClick={() =>
                        act(() => voidPayment(p.id), 'Payment removed', 'The outstanding balance was recalculated.')
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Timeline">
            {timeline.length === 0 ? (
              <EmptyState title="No history yet" description="Actions on this order are recorded here." />
            ) : (
              <ol className="px-5 py-4 space-y-3.5 border-l border-line ml-5 my-2">
                {timeline.map((t, i) => (
                  <li key={i} className="relative">
                    <span className="absolute -left-[26px] top-1 w-2 h-2 rounded-full bg-pink-400 ring-4 ring-white" />
                    <p className="text-[13px] capitalize font-medium">{t.action.replace(/_/g, ' ')}</p>
                    {t.detail && <p className="text-[11.5px] text-muted">{t.detail}</p>}
                    <p className="text-[11px] text-muted tnum">{formatDisplayDate(t.at.slice(0, 10), getDateFormat())}</p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>

      <div className="hidden print:block print-area">
        <h1 className="font-display text-xl">Order {order.order_no}</h1>
        <p className="text-sm">{order.customer_name || 'Walk-in'}</p>
        <p className="text-sm">{order.due_date ? `Due ${formatDisplayDate(order.due_date, getDateFormat())}` : ''}</p>
      </div>

      <OrderEditor
        open={editing}
        order={order}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          toast('success', 'Order updated', 'Totals and balances were recalculated.')
        }}
      />

      <PaymentModal
        open={payOpen}
        onClose={() => setPayOpen(false)}
        orderId={order.id}
        outstanding={order.outstanding}
        total={order.total}
      />

      <PlanProductionModal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        orderId={order.id}
        onDone={(n) => {
          setPlanOpen(false)
          toast('success', `${n} production batch${n === 1 ? '' : 'es'} created`, 'Open Production to review ingredient needs.')
        }}
      />

      <Confirm
        open={!!confirm}
        title={confirm === 'cancel' ? 'Cancel this order?' : confirm === 'archive' ? 'Archive this order?' : 'Delete this order?'}
        message={
          confirm === 'cancel' ? (
            <>Payments and production history stay exactly as they are — only the status changes.</>
          ) : confirm === 'archive' ? (
            <>This order is hidden from the default list. Nothing is deleted.</>
          ) : (
            <>If this order has payments or production batches, deleting is blocked to protect your history.</>
          )
        }
        danger={confirm !== 'archive'}
        confirmLabel={confirm === 'archive' ? 'Archive' : confirm === 'cancel' ? 'Cancel order' : 'Delete'}
        onConfirm={() => {
          try {
            if (confirm === 'cancel') setOrderStatus(order.id, 'Cancelled')
            else if (confirm === 'archive') {
              archiveOrder(order.id, true)
              nav('/orders')
            } else {
              archiveOrder(order.id, true)
              toast('success', 'Order archived', 'Orders with payment history are archived rather than destroyed.')
              nav('/orders')
              return
            }
            toast('success', 'Done')
          } catch (e) {
            toast('error', 'Could not complete', e instanceof Error ? e.message : String(e))
          } finally {
            setConfirm(null)
          }
        }}
        onCancel={() => setConfirm(null)}
      />
    </>
  )
}

function Line({ label, value, mutedClass = 'text-muted' }: { label: string; value: string; mutedClass?: string }) {
  return (
    <div className={`flex justify-between ${mutedClass}`}>
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  )
}

/* ================================ Payment modal ================================ */

function PaymentModal({
  open,
  onClose,
  orderId,
  outstanding,
  total,
}: {
  open: boolean
  onClose: () => void
  orderId: string
  outstanding: number
  total: number
}) {
  const toast = useApp((s) => s.toast)
  const [type, setType] = useState<'deposit' | 'payment' | 'refund'>('payment')
  const [amount, setAmount] = useState(outstanding > 0 ? outstanding : total)
  const [method, setMethod] = useState('Cash')
  const [date, setDate] = useState(todayKey())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')

  const submit = () => {
    setError('')
    try {
      recordPayment({ order_id: orderId, amount: Number(amount), type, method, paid_at: date, notes })
      toast('success', type === 'refund' ? 'Refund recorded' : 'Payment recorded', `Outstanding balance updated.`)
      onClose()
      setNotes('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a payment"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="rounded-xl bg-pale border border-line p-3.5 text-[13px] space-y-1">
          <div className="flex justify-between text-muted">
            <span>Order total</span>
            <span className="tnum text-ink">{formatMoney(total)}</span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Outstanding</span>
            <span className="tnum text-warn font-medium">{formatMoney(outstanding)}</span>
          </div>
        </div>
        <Field label="Type">
          <SelectInput value={type} onChange={(e) => setType(e.target.value as never)}>
            <option value="payment">Payment</option>
            <option value="deposit">Deposit</option>
            <option value="refund">Refund (money returned)</option>
          </SelectInput>
        </Field>
        <Field label="Amount" required>
          <TextInput type="number" min={0} step="0.01" className="tnum" value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Method">
            <SelectInput value={method} onChange={(e) => setMethod(e.target.value)}>
              {['Cash', 'Bank Transfer', 'Card', 'Mobile Money', 'Cheque', 'Other'].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Date">
            <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Notes">
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

/* ================================ Plan production ================================ */

function PlanProductionModal({
  open,
  onClose,
  orderId,
  onDone,
}: {
  open: boolean
  onClose: () => void
  orderId: string
  onDone: (created: number) => void
}) {
  const toast = useApp((s) => s.toast)
  const [date, setDate] = useState(addProductionDate())
  const [onlyRecipe, setOnlyRecipe] = useState(true)
  const [error, setError] = useState('')

  const candidates = useLive(() => (open ? createBatchesPreview(orderId) : []), [open, orderId])

  const submit = () => {
    setError('')
    try {
      const n = createBatchesFromOrder(orderId, date, onlyRecipe)
      onDone(n)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      toast('error', 'Could not plan production', e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Plan production from this order"
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Create batches
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Production date" required>
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
          <input type="checkbox" className="mt-0.5 accent-[#E35683]" checked={onlyRecipe} onChange={(e) => setOnlyRecipe(e.target.checked)} />
          <span>
            Only items with a linked recipe
            <span className="block text-[11.5px] text-muted">
              Items without a recipe still become batches, but cannot consume ingredients.
            </span>
          </span>
        </label>

        <div className="rounded-xl border border-line divide-y divide-line">
          {candidates.length === 0 ? (
            <p className="text-[13px] text-muted p-4 text-center">No items to plan.</p>
          ) : (
            candidates
              .filter((c) => (onlyRecipe ? !!c.recipe_id : true))
              .map((c, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3 text-[13px]">
                  <span className="flex-1">{c.product_name}</span>
                  <span className="tnum text-muted">× {c.quantity}</span>
                  <Badge tone={c.recipe_id ? 'success' : 'warning'}>{c.recipe_id ? c.recipe_name : 'No recipe'}</Badge>
                </div>
              ))
          )}
        </div>

        <p className="hint">
          Creating batches does not change stock. Ingredients are consumed only when you record the batch as completed.
        </p>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

function addProductionDate() {
  return todayKey()
}

function createBatchesPreview(orderId: string) {
  return productionCandidates(orderId)
}
