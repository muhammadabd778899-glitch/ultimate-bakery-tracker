import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Archive, ArchiveRestore, Plus, HandCoins } from 'lucide-react'
import {
  PageHeader, Card, Grid, Badge, STATUS_TONE, EmptyState, TableWrap, THead, Money,
} from '../components/ui'
import { CustomerModal } from './Customers'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import { listCustomers, archiveCustomer } from '../repositories/catalog'
import { listOrders, getOrderPayments } from '../repositories/orders'
import { formatDisplayDate, relativeDay } from '../lib/dates'
import { getDateFormat, formatMoney } from '../lib/format'

export function CustomerDetailPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const toast = useApp((s) => s.toast)
  const [edit, setEdit] = useState(false)

  const data = useLive(() => {
    const customer = listCustomers({ includeArchived: true }).find((c) => c.id === id)
    if (!customer) return null
    const orders = listOrders({ customerId: id, includeArchived: true })
    const payments = orders.flatMap((o) => getOrderPayments(o.id).map((p) => ({ ...p, order_no: o.order_no })))
    return { customer, orders, payments }
  }, [id])

  if (!data) {
    return (
      <Card className="p-8">
        <EmptyState title="Customer not found" action={<button className="btn-primary" onClick={() => nav('/customers')}>Back to customers</button>} />
      </Card>
    )
  }

  const { customer, orders, payments } = data
  const lifetime = orders.filter((o) => o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0)
  const outstanding = orders.filter((o) => o.status !== 'Cancelled').reduce((s, o) => s + o.outstanding, 0)

  return (
    <>
      <div className="no-print">
        <button className="btn-ghost !px-0 mb-3" onClick={() => nav('/customers')}>
          <ArrowLeft size={15} /> All customers
        </button>
        <PageHeader
          title={customer.name}
          subtitle={[
            customer.phone,
            customer.email,
            customer.address,
          ].filter(Boolean).join(' · ') || 'No contact details saved'}
          actions={
            <>
              <button className="btn-secondary" onClick={() => setEdit(true)}>
                <Pencil size={15} /> Edit
              </button>
              <button
                className="btn-secondary"
                onClick={() => {
                  archiveCustomer(customer.id, !customer.archived_at)
                  toast('success', customer.archived_at ? 'Customer restored' : 'Customer archived')
                }}
              >
                {customer.archived_at ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                {customer.archived_at ? 'Restore' : 'Archive'}
              </button>
              <button className="btn-primary" onClick={() => nav('/orders?new=1')}>
                <Plus size={15} /> New order
              </button>
            </>
          }
        />
      </div>

      <Grid cols={4} className="mb-5">
        <Stat label="Total orders" value={String(orders.filter((o) => o.status !== 'Cancelled').length)} />
        <Stat label="Lifetime purchases" value={formatMoney(lifetime)} />
        <Stat label="Outstanding" value={formatMoney(outstanding)} tone={outstanding > 0 ? 'text-warn' : 'text-ok'} />
        <Stat
          label="Last order"
          value={customer.last_order ? relativeDay(customer.last_order.slice(0, 10)) : '—'}
          small
        />
      </Grid>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Order history" className="lg:col-span-2 p-0">
          {orders.length === 0 ? (
            <EmptyState title="No orders yet" description="Create an order for this customer to build their history." action={<button className="btn-primary" onClick={() => nav('/orders?new=1')}><Plus size={15} /> New order</button>} />
          ) : (
            <TableWrap>
              <THead cols={['Order', 'Due', 'Status', 'Payment', 'Total', 'Outstanding']} />
              <tbody className="divide-y divide-line">
                {orders.map((o) => (
                  <tr key={o.id} className="hover:bg-pale">
                    <td className="td">
                      <Link to={`/orders/${o.id}`} className="font-medium hover:text-pink-600">{o.order_no}</Link>
                    </td>
                    <td className="td tnum text-[12.5px]">{o.due_date ? formatDisplayDate(o.due_date, getDateFormat()) : '—'}</td>
                    <td className="td"><Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge></td>
                    <td className="td"><Badge tone={STATUS_TONE[o.payment_status] ?? 'neutral'}>{o.payment_status}</Badge></td>
                    <td className="td tnum font-medium">{formatMoney(o.total)}</td>
                    <td className={`td tnum ${o.outstanding > 0 ? 'text-warn' : 'text-muted'}`}>{formatMoney(o.outstanding)}</td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Payments" className="p-0">
            {payments.length === 0 ? (
              <EmptyState title="No payments yet" icon={<HandCoins size={24} />} />
            ) : (
              <div className="divide-y divide-line max-h-[340px] overflow-y-auto">
                {payments.map((p) => (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium">{p.order_no}</p>
                      <p className="text-[11.5px] text-muted">
                        {formatDisplayDate(p.paid_at, getDateFormat())} · {p.method}
                      </p>
                    </div>
                    <span className={`tnum text-[13.5px] font-medium ${p.type === 'refund' ? 'text-bad' : 'text-ok'}`}>
                      {p.type === 'refund' ? '−' : ''}
                      {formatMoney(p.amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Notes" className="p-5">
            <p className="text-[13.5px] whitespace-pre-wrap leading-relaxed">{customer.notes || 'No notes yet.'}</p>
            <p className="text-[11.5px] text-muted mt-3">
              Customer since {formatDisplayDate(customer.created_at.slice(0, 10), getDateFormat())}
            </p>
          </Card>
        </div>
      </div>

      <CustomerModal open={edit} customerId={customer.id} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); toast('success', 'Customer updated') }} />
    </>
  )
}

function Stat({ label, value, tone = 'text-ink', small }: { label: string; value: string; tone?: string; small?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-[11.5px] uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p className={`mt-1.5 ${small ? 'text-[17px]' : 'text-[22px]'} font-semibold tnum ${tone}`}>{value}</p>
    </Card>
  )
}
