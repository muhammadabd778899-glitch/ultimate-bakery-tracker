import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Pencil, Archive, ArchiveRestore, FileDown, UserPlus } from 'lucide-react'
import {
  PageHeader, Card, SearchInput, Badge, EmptyState, Modal, Field, TextInput, TextArea, TableWrap, THead, ErrorNote,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import { listCustomers, createCustomer, updateCustomer, archiveCustomer, findDuplicateCustomer } from '../repositories/catalog'
import { formatDisplayDate } from '../lib/dates'
import { getDateFormat } from '../lib/format'
import { formatMoney } from '../lib/format'
import { exportCsv } from '../lib/exporters'

const schema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  phone: z.string().optional(),
  email: z.string().email('Enter a valid email').or(z.literal('')).optional(),
  address: z.string().optional(),
  notes: z.string().optional(),
})
type Values = z.infer<typeof schema>

export function CustomersPage() {
  const [params, setParams] = useSearchParams()
  const nav = useNavigate()
  const toast = useApp((s) => s.toast)
  const [search, setSearch] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (params.get('new') === '1') {
      setEditingId(null)
      setOpen(true)
      params.delete('new')
      setParams(params, { replace: true })
    }
  }, [params, setParams])

  const customers = useLive(() => listCustomers({ search, includeArchived: showArchived }), [search, showArchived])

  const doExport = () => {
    exportCsv(
      'customers.csv',
      ['Name', 'Phone', 'Email', 'Address', 'Orders', 'Total purchases', 'Outstanding', 'Last order', 'Notes'],
      customers.map((c) => [
        c.name, c.phone, c.email, c.address, c.total_orders, c.total_spent, c.outstanding,
        c.last_order ? c.last_order.slice(0, 10) : '', c.notes,
      ])
    )
    toast('success', 'Customers exported')
  }

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} customer${customers.length === 1 ? '' : 's'}`}
        actions={
          <>
            <button className="btn-secondary" onClick={doExport}>
              <FileDown size={15} /> Export CSV
            </button>
            <button className="btn-primary" onClick={() => { setEditingId(null); setOpen(true) }}>
              <Plus size={15} /> New customer
            </button>
          </>
        }
      />

      <Card className="p-4 mb-5 no-print">
        <div className="flex flex-wrap gap-3 items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Name, phone or email…" className="w-full sm:w-72" />
          <label className="flex items-center gap-2 text-[13px] text-muted cursor-pointer">
            <input type="checkbox" className="accent-[#E8A3BA]" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Include archived
          </label>
        </div>
      </Card>

      <Card className="p-0">
        {customers.length === 0 ? (
          <EmptyState
            title={search ? 'No customers match' : 'No customers yet'}
            description={search ? 'Try a different search.' : 'Keep every customer in one place with their order and payment history.'}
            icon={<UserPlus size={26} />}
            action={
              !search && (
                <button className="btn-primary" onClick={() => { setEditingId(null); setOpen(true) }}>
                  <Plus size={15} /> Add customer
                </button>
              )
            }
          />
        ) : (
          <TableWrap>
            <THead cols={['Customer', 'Contact', 'Orders', 'Total purchases', 'Outstanding', 'Last order', '']} />
            <tbody className="divide-y divide-line">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-pale">
                  <td className="td">
                    <Link to={`/customers/${c.id}`} className="font-medium hover:text-pink-600">
                      {c.name}
                    </Link>
                    {c.archived_at && <Badge tone="neutral">archived</Badge>}
                  </td>
                  <td className="td text-muted text-[12.5px]">
                    <span className="block">{c.phone || '—'}</span>
                    {c.email && <span className="block text-[11.5px]">{c.email}</span>}
                  </td>
                  <td className="td tnum">{c.total_orders}</td>
                  <td className="td tnum font-medium">{formatMoney(c.total_spent)}</td>
                  <td className={`td tnum ${c.outstanding > 0 ? 'text-warn font-medium' : 'text-muted'}`}>{formatMoney(c.outstanding)}</td>
                  <td className="td tnum text-muted text-[12.5px]">
                    {c.last_order ? formatDisplayDate(c.last_order.slice(0, 10), getDateFormat()) : '—'}
                  </td>
                  <td className="td text-right whitespace-nowrap no-print">
                    <button
                      className="btn-ghost !h-8 !px-2"
                      title="Edit"
                      onClick={() => {
                        setEditingId(c.id)
                        setOpen(true)
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="btn-ghost !h-8 !px-2"
                      title={c.archived_at ? 'Restore' : 'Archive'}
                      onClick={() => {
                        archiveCustomer(c.id, !c.archived_at)
                        toast('success', c.archived_at ? 'Customer restored' : 'Customer archived')
                      }}
                    >
                      {c.archived_at ? <ArchiveRestore size={15} /> : <Archive size={15} />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <CustomerModal
        open={open}
        customerId={editingId}
        onClose={() => setOpen(false)}
        onSaved={() => {
          setOpen(false)
          toast('success', editingId ? 'Customer updated' : 'Customer added')
        }}
      />
    </>
  )
}

export function CustomerModal({
  open,
  customerId,
  onClose,
  onSaved,
}: {
  open: boolean
  customerId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useApp((s) => s.toast)
  const [error, setError] = useState('')
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', phone: '', email: '', address: '', notes: '' } })

  const existing = useLive(() => (open && customerId ? listCustomers({ includeArchived: true }).find((c) => c.id === customerId) : undefined), [open, customerId])

  useEffect(() => {
    if (!open) return
    setError('')
    reset({
      name: existing?.name ?? '',
      phone: existing?.phone ?? '',
      email: existing?.email ?? '',
      address: existing?.address ?? '',
      notes: existing?.notes ?? '',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, customerId])

  const submit = handleSubmit(async (v) => {
    setError('')
    if (!customerId) {
      const dup = findDuplicateCustomer(v.name, v.phone ?? '')
      if (dup) {
        setError(`A customer named “${dup.name}” with that phone number already exists. Open them instead of creating a duplicate.`)
        return
      }
    }
    try {
      if (customerId) updateCustomer(customerId, v as never)
      else createCustomer(v as never)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customerId ? 'Edit customer' : 'New customer'}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={isSubmitting}>
            {customerId ? 'Save changes' : 'Add customer'}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Name" required error={errors.name?.message} className="sm:col-span-2">
            <TextInput autoFocus {...register('name')} placeholder="e.g. Layla Ahmed" />
          </Field>
          <Field label="Phone" hint="Optional">
            <TextInput {...register('phone')} placeholder="+1 555 0100" />
          </Field>
          <Field label="Email" error={errors.email?.message} hint="Optional">
            <TextInput {...register('email')} placeholder="Optional" />
          </Field>
        </div>
        <Field label="Address" hint="Useful for deliveries.">
          <TextInput {...register('address')} placeholder="Optional" />
        </Field>
        <Field label="Notes">
          <TextArea rows={3} {...register('notes')} placeholder="Allergies, favourite flavours, payment habits…" />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
