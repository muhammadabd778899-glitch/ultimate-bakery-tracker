import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, CheckCircle2, Circle, Trash2, CalendarDays, ListTodo, Pencil } from 'lucide-react'
import {
  PageHeader, Card, Badge, STATUS_TONE, EmptyState, Modal, Field, TextInput, SelectInput, TextArea, TableWrap, THead,
  Confirm, ErrorNote,
} from '../components/ui'
import { useLive } from '../lib/useLive'
import { useApp } from '../store/app'
import { calendarItems, listTasks, createTask, updateTask, setTaskStatus, deleteTask, listEvents, createEvent, deleteEvent, type CalendarItem } from '../repositories/planner'
import { listOrders } from '../repositories/orders'
import {
  todayKey, addDays, monthStart, monthLabel, monthMatrix, startOfWeek, endOfWeek, weekdayShort, formatDisplayDate, parseKey,
} from '../lib/dates'
import { getDateFormat } from '../lib/format'

const KIND_STYLE: Record<CalendarItem['kind'], { bg: string; text: string; label: string }> = {
  order: { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Order' },
  production: { bg: 'bg-[#EAF4EE]', text: 'text-[#3F6C53]', label: 'Production' },
  task: { bg: 'bg-[#FCF1E1]', text: 'text-[#8A5F24]', label: 'Task' },
  expiry: { bg: 'bg-[#FBEAEB]', text: 'text-[#A9505A]', label: 'Expiry' },
  event: { bg: 'bg-surface', text: 'text-muted', label: 'Event' },
  purchase: { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Purchase' },
}

export function CalendarPage() {
  const toast = useApp((s) => s.toast)
  const [view, setView] = useState<'month' | 'week' | 'day' | 'upcoming'>('month')
  const [cursor, setCursor] = useState(todayKey())
  const [selected, setSelected] = useState(todayKey())
  const [taskOpen, setTaskOpen] = useState(false)
  const [editTask, setEditTask] = useState<{ id: string; defaults: TaskDefaults } | null>(null)
  const [eventOpen, setEventOpen] = useState(false)
  const [taskFilter, setTaskFilter] = useState('Open')
  const [toDelete, setToDelete] = useState<{ kind: 'task' | 'event'; id: string } | null>(null)

  const range = useMemo(() => {
    if (view === 'month') {
      const grid = monthMatrix(cursor)
      return { from: grid[0], to: grid[grid.length - 1] }
    }
    if (view === 'week') return { from: startOfWeek(cursor), to: endOfWeek(cursor) }
    if (view === 'day') return { from: cursor, to: cursor }
    return { from: todayKey(), to: addDays(todayKey(), 45) }
  }, [view, cursor])

  const items = useLive(() => calendarItems(range.from, range.to), [range.from, range.to])
  const tasks = useLive(
    () =>
      listTasks({
        status: taskFilter === 'All' ? 'All' : taskFilter === 'Open' ? undefined : taskFilter,
        search: '',
      }),
    [taskFilter]
  )
  const openTasks = useLive(() => listTasks().filter((t) => t.status !== 'Completed'), [])
  const orders = useLive(() => listOrders({ status: 'All' }).filter((o) => o.status !== 'Cancelled').slice(0, 60), [])

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const i of items) {
      const arr = m.get(i.date) ?? []
      arr.push(i)
      m.set(i.date, arr)
    }
    return m
  }, [items])

  const nav = (dir: -1 | 1) => {
    if (view === 'month') setCursor((c) => addDays(monthStart(c), dir * 28))
    else if (view === 'week') setCursor((c) => addDays(c, dir * 7))
    else setCursor((c) => addDays(c, dir))
  }

  const title = view === 'month' ? monthLabel(cursor) : view === 'week' ? `${formatDisplayDate(startOfWeek(cursor), getDateFormat())} → ${formatDisplayDate(endOfWeek(cursor), getDateFormat())}` : formatDisplayDate(cursor, getDateFormat())

  const days: string[] =
    view === 'month'
      ? monthMatrix(cursor)
      : view === 'week'
        ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i))
        : [cursor]

  return (
    <>
      <PageHeader
        title="Calendar & Tasks"
        subtitle="Orders, production, expiries and your own to-dos in one view"
        actions={
          <>
            <div className="flex rounded-xl border border-line bg-white overflow-hidden">
              {(['month', 'week', 'day', 'upcoming'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 h-10 text-[12.5px] capitalize border-l border-line first:border-0 ${
                    view === v ? 'bg-pink-100 text-pink-700 font-medium' : 'text-muted hover:text-ink'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
            <button className="btn-secondary" onClick={() => setEventOpen(true)}>
              <CalendarDays size={15} /> New event
            </button>
            <button className="btn-primary" onClick={() => setTaskOpen(true)}>
              <Plus size={15} /> New task
            </button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <Card className="p-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-line">
              <button className="btn-ghost !h-8 !px-2" onClick={() => nav(-1)}><ChevronLeft size={16} /></button>
              <div className="text-center">
                <p className="font-display text-lg">{title}</p>
                <button className="text-[11.5px] text-pink-600 hover:underline" onClick={() => { setCursor(todayKey()); setSelected(todayKey()) }}>
                  Today
                </button>
              </div>
              <button className="btn-ghost !h-8 !px-2" onClick={() => nav(1)}><ChevronRight size={16} /></button>
            </div>

            {view === 'month' ? (
              <div className="grid grid-cols-7 border-b border-line bg-warm">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                  <div key={d} className="px-2 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted text-center">
                    {d}
                  </div>
                ))}
              </div>
            ) : null}

            <div className={view === 'month' ? 'grid grid-cols-7' : view === 'week' ? 'grid grid-cols-1 sm:grid-cols-7' : ''}>
              {days.map((d) => {
                const dayItems = byDate.get(d) ?? []
                const isToday = d === todayKey()
                const inMonth = d.slice(0, 7) === cursor.slice(0, 7)
                if (view === 'month') {
                  return (
                    <button
                      key={d}
                      onClick={() => { setSelected(d); setView('day'); setCursor(d) }}
                      className={`min-h-[92px] border-r border-b border-line p-1.5 text-left hover:bg-pink-50 transition ${
                        inMonth ? 'bg-white' : 'bg-pale/60'
                      } ${selected === d ? 'ring-1 ring-inset ring-pink-400' : ''}`}
                    >
                      <span className={`text-[12px] tnum inline-block w-6 h-6 text-center leading-6 rounded-full ${
                        isToday ? 'bg-pink-400 text-white font-semibold' : inMonth ? 'text-ink' : 'text-muted'
                      }`}>
                        {parseKey(d).getDate()}
                      </span>
                      <div className="mt-1 space-y-1">
                        {dayItems.slice(0, 3).map((i, idx) => {
                          const st = KIND_STYLE[i.kind]
                          return (
                            <p key={idx} className={`text-[10.5px] leading-tight px-1.5 py-0.5 rounded truncate ${st.bg} ${st.text}`}>
                              {i.title}
                            </p>
                          )
                        })}
                        {dayItems.length > 3 && <p className="text-[10px] text-muted px-1">+{dayItems.length - 3} more</p>}
                      </div>
                    </button>
                  )
                }
                return (
                  <div key={d} className="border-r border-b border-line p-2 min-h-[80px] bg-white">
                    <p className={`text-[12px] tnum mb-1.5 ${d === todayKey() ? 'text-pink-600 font-semibold' : 'text-muted'}`}>
                      {view === 'week' ? `${weekdayShort(d)} ${parseKey(d).getDate()}` : parseKey(d).getDate()}
                    </p>
                    <div className="space-y-1">
                      {dayItems.map((i, idx) => {
                        const st = KIND_STYLE[i.kind]
                        return (
                          <p key={idx} className={`text-[11px] leading-tight px-1.5 py-0.5 rounded ${st.bg} ${st.text}`}>
                            {i.title}
                          </p>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>

          <Card title={`Tasks ${taskFilter !== 'All' ? `· ${taskFilter}` : ''}`} className="p-0"
            action={
              <select className="input !h-8 !w-auto !text-[12.5px]" value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}>
                {['Open', 'To Do', 'In Progress', 'Completed', 'All'].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            }
          >
            {tasks.length === 0 ? (
              <EmptyState title="No tasks" description="Capture follow-ups, prep reminders and deliveries as tasks." icon={<ListTodo size={26} />} action={<button className="btn-primary" onClick={() => setTaskOpen(true)}><Plus size={15} /> New task</button>} />
            ) : (
              <TableWrap>
                <THead cols={['Done', 'Task', 'Due', 'Priority', 'Status', 'Order', '']} />
                <tbody className="divide-y divide-line">
                  {tasks.map((t) => {
                    const done = t.status === 'Completed'
                    const overdue = !done && t.due_date && t.due_date < todayKey()
                    return (
                      <tr key={t.id} className={`hover:bg-pale ${done ? 'opacity-60' : ''}`}>
                        <td className="td">
                          <button
                            className="text-pink-500 hover:text-pink-700"
                            title={done ? 'Mark as to do' : 'Mark as completed'}
                            onClick={() => {
                              setTaskStatus(t.id, done ? 'To Do' : 'Completed')
                              toast('success', done ? 'Task reopened' : 'Task completed')
                            }}
                          >
                            {done ? <CheckCircle2 size={18} className="text-ok" /> : <Circle size={18} />}
                          </button>
                        </td>
                        <td className="td">
                          <span className={done ? 'line-through' : 'font-medium'}>{t.title}</span>
                          {t.description && <span className="block text-[11.5px] text-muted">{t.description}</span>}
                        </td>
                        <td className="td tnum text-[12.5px]">
                          {t.due_date ? (
                            <span className={overdue ? 'text-bad font-medium' : ''}>
                              {formatDisplayDate(t.due_date, getDateFormat())}
                              {overdue && ' · overdue'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="td"><Badge tone={STATUS_TONE[t.priority] ?? 'neutral'}>{t.priority}</Badge></td>
                        <td className="td"><Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{t.status}</Badge></td>
                        <td className="td text-[12.5px]">
                          {t.order_no ? <Link to={`/orders/${t.related_order_id}`} className="text-pink-600 hover:underline">{t.order_no}</Link> : <span className="text-muted">—</span>}
                        </td>
                        <td className="td text-right whitespace-nowrap no-print">
                          <button
                            className="btn-ghost !h-8 !px-2"
                            title="Edit"
                            onClick={() => {
                              setEditTask({
                                id: t.id,
                                defaults: {
                                  title: t.title,
                                  description: t.description,
                                  due_date: t.due_date,
                                  priority: t.priority,
                                  status: t.status,
                                  related_order_id: t.related_order_id,
                                  notes: t.notes,
                                },
                              })
                              setTaskOpen(true)
                            }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button className="btn-ghost !h-8 !px-2" title="Delete" onClick={() => setToDelete({ kind: 'task', id: t.id })}>
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
        </div>

        {/* side panel */}
        <div className="space-y-5">
          <Card title={`Agenda · ${formatDisplayDate(selected, getDateFormat())}`} className="p-0">
            {(byDate.get(selected) ?? []).length === 0 ? (
              <EmptyState title="Nothing scheduled" description="Orders and production due this day appear here." />
            ) : (
              <div className="divide-y divide-line">
                {(byDate.get(selected) ?? []).map((i, idx) => {
                  const st = KIND_STYLE[i.kind]
                  return (
                    <div key={idx} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13.5px] font-medium leading-snug">{i.title}</p>
                        <span className={`badge shrink-0 ${st.bg} ${st.text}`}>{st.label}</span>
                      </div>
                      <p className="text-[11.5px] text-muted mt-0.5">{i.meta}</p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <Badge tone={STATUS_TONE[i.status] ?? 'neutral'}>{i.status}</Badge>
                        {i.kind === 'order' && i.linkId && (
                          <Link to={`/orders/${i.linkId}`} className="text-[11.5px] text-pink-600 hover:underline">Open order</Link>
                        )}
                        {i.kind === 'production' && <Link to="/production" className="text-[11.5px] text-pink-600 hover:underline">Open production</Link>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </Card>

          <Card title="Upcoming orders" className="p-0">
            {orders.filter((o) => (o.due_date ?? '') >= todayKey()).length === 0 ? (
              <EmptyState title="Nothing due" />
            ) : (
              <div className="divide-y divide-line max-h-[300px] overflow-y-auto">
                {orders
                  .filter((o) => (o.due_date ?? '') >= todayKey())
                  .slice(0, 10)
                  .map((o) => (
                    <Link key={o.id} to={`/orders/${o.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-pink-50">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate">{o.customer_name || o.order_no}</p>
                        <p className="text-[11.5px] text-muted">{o.due_date ? formatDisplayDate(o.due_date, getDateFormat()) : 'no date'} {o.due_time}</p>
                      </div>
                      <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>{o.status}</Badge>
                    </Link>
                  ))}
              </div>
            )}
          </Card>

          {openTasks.length > 0 && (
            <Card title="Overdue" className="p-0">
              <div className="divide-y divide-line">
                {openTasks
                  .filter((t) => t.due_date && t.due_date < todayKey())
                  .slice(0, 6)
                  .map((t) => (
                    <div key={t.id} className="px-4 py-2.5 flex items-center gap-3">
                      <span className="flex-1 text-[13px]">{t.title}</span>
                      <span className="text-[11.5px] text-bad tnum">{formatDisplayDate(t.due_date!, getDateFormat())}</span>
                    </div>
                  ))}
                {openTasks.filter((t) => t.due_date && t.due_date < todayKey()).length === 0 && (
                  <p className="px-4 py-4 text-[13px] text-muted text-center">Nothing overdue. 🎉</p>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      <TaskModal
        open={taskOpen}
        editing={editTask}
        onClose={() => {
          setTaskOpen(false)
          setEditTask(null)
        }}
        onSaved={() => {
          setTaskOpen(false)
          setEditTask(null)
          toast('success', 'Task saved')
        }}
      />
      <EventModal open={eventOpen} defaultDate={selected} onClose={() => setEventOpen(false)} onSaved={() => { setEventOpen(false); toast('success', 'Event added') }} />

      <Confirm
        open={!!toDelete}
        title={toDelete?.kind === 'task' ? 'Delete this task?' : 'Delete this event?'}
        message="This only removes the item itself — nothing else is affected."
        danger
        confirmLabel="Delete"
        onConfirm={() => {
          try {
            if (toDelete?.kind === 'task') deleteTask(toDelete.id)
            else if (toDelete) deleteEvent(toDelete.id)
            toast('success', 'Deleted')
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

interface TaskDefaults {
  title: string
  description: string
  due_date: string | null
  priority: string
  status: string
  related_order_id: string | null
  notes: string
}

function TaskModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean
  editing: { id: string; defaults: TaskDefaults } | null
  onClose: () => void
  onSaved: () => void
}) {
  const toast = useApp((s) => s.toast)
  const orders = useLive(() => listOrders({ status: 'All' }).slice(0, 80), [])
  const [form, setForm] = useState<TaskDefaults>({
    title: '', description: '', due_date: todayKey(), priority: 'Normal', status: 'To Do', related_order_id: null, notes: '',
  })
  const [error, setError] = useState('')
  const [initializedFor, setInitializedFor] = useState<string>('__never__')

  const openKey = editing ? `edit:${editing.id}` : open ? 'new' : '__never__'
  if (open && openKey !== initializedFor) {
    setInitializedFor(openKey)
    setError('')
    setForm(editing?.defaults ?? { title: '', description: '', due_date: todayKey(), priority: 'Normal', status: 'To Do', related_order_id: null, notes: '' })
  }

  const submit = () => {
    if (!form.title.trim()) {
      setError('Task title is required.')
      return
    }
    try {
      if (editing) updateTask(editing.id, form as never)
      else createTask(form as never)
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Edit task' : 'New task'}
      size="md"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>{editing ? 'Save changes' : 'Add task'}</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Title" required>
          <TextInput autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Confirm Saturday cake designs" />
        </Field>
        <Field label="Description">
          <TextArea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </Field>
        <div className="grid sm:grid-cols-3 gap-3">
          <Field label="Due date">
            <TextInput type="date" value={form.due_date ?? ''} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
          </Field>
          <Field label="Priority">
            <SelectInput value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
              <option>High</option>
              <option>Normal</option>
              <option>Low</option>
            </SelectInput>
          </Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option>To Do</option>
              <option>In Progress</option>
              <option>Completed</option>
            </SelectInput>
          </Field>
        </div>
        <Field label="Related order" hint="Optional link for context.">
          <SelectInput value={form.related_order_id ?? ''} onChange={(e) => setForm((f) => ({ ...f, related_order_id: e.target.value || null }))}>
            <option value="">— None —</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>{o.order_no} · {o.customer_name}</option>
            ))}
          </SelectInput>
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}

function EventModal({ open, defaultDate, onClose, onSaved }: { open: boolean; defaultDate: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ title: '', start_date: defaultDate, end_date: '', event_type: 'other', notes: '' })
  const [error, setError] = useState('')

  const submit = () => {
    if (!form.title.trim() || !form.start_date) {
      setError('Title and date are required.')
      return
    }
    try {
      createEvent({ ...form, end_date: form.end_date || null })
      onSaved()
      setForm({ title: '', start_date: defaultDate, end_date: '', event_type: 'other', notes: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New event"
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={submit}>Add event</button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Field label="Title" required>
          <TextInput autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Market stall" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" required>
            <TextInput type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
          </Field>
          <Field label="End date">
            <TextInput type="date" value={form.end_date} onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))} />
          </Field>
        </div>
        <Field label="Type">
          <SelectInput value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}>
            <option value="other">Other</option>
            <option value="market">Market / stall</option>
            <option value="class">Baking class</option>
            <option value="holiday">Holiday (closed)</option>
          </SelectInput>
        </Field>
        <Field label="Notes">
          <TextArea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
      </div>
    </Modal>
  )
}
