import { query, queryOne, run, transaction, nowIso, logAudit, insertSql } from '../db/database'
import { uid } from '../lib/id'
import { todayKey, addDays } from '../lib/dates'
import { notifyDataChanged } from '../store/app'
import type { CalEvent, Task } from '../types'
import { getSettings } from './settings'

/* ============================== Tasks ============================== */

export function listTasks(opts: { status?: string; from?: string; to?: string; search?: string } = {}): (Task & { order_no: string | null })[] {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.status && opts.status !== 'All') {
    where.push('t.status = ?')
    params.push(opts.status)
  }
  if (opts.from) {
    where.push('date(t.due_date) >= date(?)')
    params.push(opts.from)
  }
  if (opts.to) {
    where.push('date(t.due_date) <= date(?)')
    params.push(opts.to)
  }
  if (opts.search?.trim()) {
    where.push('(t.title LIKE ? OR t.description LIKE ?)')
    params.push(`%${opts.search.trim()}%`, `%${opts.search.trim()}%`)
  }
  return query(
    `SELECT t.*, o.order_no AS order_no FROM tasks t LEFT JOIN orders o ON o.id = t.related_order_id
     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY (t.status = 'Completed'), date(t.due_date) IS NULL, date(t.due_date) ASC, t.created_at DESC`,
    params
  )
}

export function createTask(input: Partial<Task>): Task {
  if (!input.title?.trim()) throw new Error('Task title is required.')
  const id = uid('tsk_')
  const cols = ['id', 'title', 'description', 'due_date', 'priority', 'status', 'related_order_id', 'notes', 'created_at', 'is_sample']
  run(insertSql('tasks', cols), [
    id,
    input.title.trim(),
    input.description ?? '',
    input.due_date ?? null,
    input.priority || 'Normal',
    input.status || 'To Do',
    input.related_order_id ?? null,
    input.notes ?? '',
    nowIso(),
    0,
  ])
  logAudit('task', id, 'create', input.title)
  notifyDataChanged()
  return queryOne<Task>('SELECT * FROM tasks WHERE id = ?', [id])!
}

export function updateTask(id: string, input: Partial<Task>) {
  run(`UPDATE tasks SET title=?, description=?, due_date=?, priority=?, status=?, related_order_id=?, notes=? WHERE id=?`, [
    input.title?.trim() ?? '',
    input.description ?? '',
    input.due_date ?? null,
    input.priority || 'Normal',
    input.status || 'To Do',
    input.related_order_id ?? null,
    input.notes ?? '',
    id,
  ])
  logAudit('task', id, 'update')
  notifyDataChanged()
}

export function setTaskStatus(id: string, status: Task['status']) {
  run('UPDATE tasks SET status = ? WHERE id = ?', [status, id])
  logAudit('task', id, 'status', status)
  notifyDataChanged()
}

export function deleteTask(id: string) {
  run('DELETE FROM tasks WHERE id = ?', [id])
  logAudit('task', id, 'delete')
  notifyDataChanged()
}

/* ============================== Events ============================== */

export function listEvents(from?: string, to?: string): CalEvent[] {
  const where: string[] = []
  const params: unknown[] = []
  if (from) {
    where.push('date(COALESCE(end_date, start_date)) >= date(?)')
    params.push(from)
  }
  if (to) {
    where.push('date(start_date) <= date(?)')
    params.push(to)
  }
  return query(
    `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY date(start_date) ASC`,
    params
  )
}

export function createEvent(input: Partial<CalEvent>): CalEvent {
  if (!input.title?.trim()) throw new Error('Event title is required.')
  if (!input.start_date) throw new Error('Event date is required.')
  const id = uid('evt_')
  const cols = ['id', 'title', 'start_date', 'end_date', 'event_type', 'related_order_id', 'notes', 'created_at', 'is_sample']
  run(insertSql('events', cols), [
    id,
    input.title.trim(),
    input.start_date,
    input.end_date ?? null,
    input.event_type || 'other',
    input.related_order_id ?? null,
    input.notes ?? '',
    nowIso(),
    0,
  ])
  logAudit('event', id, 'create', input.title)
  notifyDataChanged()
  return queryOne<CalEvent>('SELECT * FROM events WHERE id = ?', [id])!
}

export function deleteEvent(id: string) {
  run('DELETE FROM events WHERE id = ?', [id])
  logAudit('event', id, 'delete')
  notifyDataChanged()
}

/* ============================== Calendar feed ============================== */

export interface CalendarItem {
  date: string
  kind: 'order' | 'production' | 'task' | 'expiry' | 'event' | 'purchase'
  title: string
  meta: string
  status: string
  linkId?: string
}

export function calendarItems(from: string, to: string): CalendarItem[] {
  const out: CalendarItem[] = []

  for (const o of query<{ id: string; order_no: string; customer_name: string; due_date: string; status: string; product_count: number }>(
    `SELECT o.id, o.order_no, o.customer_name, o.due_date, o.status,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS product_count
     FROM orders o
     WHERE o.due_date IS NOT NULL AND date(o.due_date) BETWEEN date(?) AND date(?)
       AND o.archived_at IS NULL AND o.status <> 'Cancelled'`,
    [from, to]
  )) {
    out.push({
      date: o.due_date,
      kind: 'order',
      title: `${o.order_no} — ${o.customer_name || 'Walk-in'}`,
      meta: `${o.product_count} item(s)`,
      status: o.status,
      linkId: o.id,
    })
  }

  for (const b of query<{ id: string; batch_no: string; product_name: string; production_date: string; status: string; planned_qty: number }>(
    `SELECT id, batch_no, product_name, production_date, status, planned_qty
     FROM production_batches WHERE date(production_date) BETWEEN date(?) AND date(?)`,
    [from, to]
  )) {
    out.push({
      date: b.production_date,
      kind: 'production',
      title: `${b.batch_no} — ${b.product_name}`,
      meta: `Planned × ${b.planned_qty}`,
      status: b.status,
      linkId: b.id,
    })
  }

  for (const t of query<{ id: string; title: string; due_date: string; status: string; priority: string }>(
    `SELECT id, title, due_date, status, priority FROM tasks
     WHERE due_date IS NOT NULL AND date(due_date) BETWEEN date(?) AND date(?)`,
    [from, to]
  )) {
    out.push({
      date: t.due_date,
      kind: 'task',
      title: t.title,
      meta: t.priority,
      status: t.status,
      linkId: t.id,
    })
  }

  for (const e of query<{ id: string; title: string; start_date: string; event_type: string }>(
    `SELECT id, title, start_date, event_type FROM events WHERE date(start_date) BETWEEN date(?) AND date(?)`,
    [from, to]
  )) {
    out.push({ date: e.start_date, kind: 'event', title: e.title, meta: e.event_type, status: 'Event', linkId: e.id })
  }

  const settings = getSettings()
  const expiryTo = addDays(todayKey(), Math.max(0, settings.expiry_warning_days || 7))
  for (const i of query<{ id: string; name: string; expiry_date: string; current_stock: number }>(
    `SELECT id, name, expiry_date, current_stock FROM ingredients
     WHERE expiry_date IS NOT NULL AND expiry_date <> ''
       AND date(expiry_date) >= date(?) AND date(expiry_date) <= date(?)
     ORDER BY date(expiry_date) ASC`,
    [from, expiryTo]
  )) {
    out.push({
      date: i.expiry_date,
      kind: 'expiry',
      title: `${i.name} expires`,
      meta: `${i.current_stock} left`,
      status: 'Expiry',
      linkId: i.id,
    })
  }

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.kind.localeCompare(b.kind)))
}
