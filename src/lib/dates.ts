/* Local date helpers — everything uses the computer's own clock, no network. */

export type DateKey = string // 'YYYY-MM-DD'

export function todayKey(d: Date = new Date()): DateKey {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function toDateKey(input: string | Date | null | undefined): DateKey {
  if (!input) return ''
  if (input instanceof Date) return todayKey(input)
  const s = String(input)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : todayKey(d)
}

export function parseKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map((x) => parseInt(x, 10))
  return new Date(y || 2000, (m || 1) - 1, d || 1)
}

export function addDays(key: DateKey, days: number): DateKey {
  const d = parseKey(key)
  d.setDate(d.getDate() + days)
  return todayKey(d)
}

export function daysBetween(a: DateKey, b: DateKey): number {
  if (!a || !b) return 0
  return Math.round((parseKey(b).getTime() - parseKey(a).getTime()) / 86400000)
}

export function monthStart(key: DateKey): DateKey {
  return key.slice(0, 7) + '-01'
}

export function monthKey(date: DateKey): string {
  return date.slice(0, 7)
}

export function startOfWeek(key: DateKey): DateKey {
  const d = parseKey(key)
  const day = d.getDay() // 0 Sun
  const diff = day === 0 ? -6 : 1 - day // Monday start
  d.setDate(d.getDate() + diff)
  return todayKey(d)
}

export function endOfWeek(key: DateKey): DateKey {
  return addDays(startOfWeek(key), 6)
}

export function startOfYear(key: DateKey): DateKey {
  return key.slice(0, 4) + '-01-01'
}

export function formatDisplayDate(key: DateKey | null | undefined, pattern = 'YYYY-MM-DD'): string {
  if (!key) return '—'
  const d = parseKey(toDateKey(key))
  if (Number.isNaN(d.getTime())) return '—'
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()]
  const yy = d.getFullYear()
  switch (pattern) {
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${yy}`
    case 'MM/DD/YYYY':
      return `${mm}/${dd}/${yy}`
    case 'DD.MM.YYYY':
      return `${dd}.${mm}.${yy}`
    case 'D MMM YYYY':
      return `${parseInt(dd, 10)} ${mon} ${yy}`
    case 'MMM D, YYYY':
      return `${mon} ${parseInt(dd, 10)}, ${yy}`
    default:
      return `${yy}-${mm}-${dd}`
  }
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function weekdayShort(key: DateKey): string {
  return WEEKDAYS[parseKey(key).getDay()]
}

export function relativeDay(key: DateKey): string {
  const diff = daysBetween(todayKey(), key)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 14) return `In ${diff} days`
  if (diff < -1 && diff > -14) return `${Math.abs(diff)} days ago`
  return formatDisplayDate(key, 'MMM D, YYYY')
}

export function monthLabel(key: DateKey): string {
  const d = parseKey(key)
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric' })
}

export function monthMatrix(key: DateKey): DateKey[] {
  const first = parseKey(monthStart(key))
  const gridStart = startOfWeek(todayKey(first))
  const out: DateKey[] = []
  for (let i = 0; i < 42; i++) out.push(addDays(gridStart, i))
  return out
}

export function minutesToHm(min: number): string {
  if (!min) return '0m'
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  if (!h) return `${m}m`
  if (!m) return `${h}h`
  return `${h}h ${m}m`
}
