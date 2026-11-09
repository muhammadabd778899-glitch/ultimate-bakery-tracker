import { query, queryOne, run, scalar, nowIso, logAudit } from '../db/database'
import type { Settings } from '../types'
import { setFormatSettings } from '../lib/format'

const DEFAULTS: Omit<Settings, 'id' | 'updated_at'> = {
  bakery_name: '',
  business_type: '',
  owner_name: '',
  currency: 'USD',
  currency_symbol: '$',
  currency_position: 'prefix',
  date_format: 'YYYY-MM-DD',
  measurement_system: 'metric',
  default_tax_rate: 0,
  default_labor_rate: 0,
  labor_unit: 'hour',
  overhead_method: 'percent',
  overhead_percent: 0,
  overhead_fixed: 0,
  opening_days: 'Mon,Tue,Wed,Thu,Fri,Sat',
  default_lead_time_days: 3,
  low_stock_warnings: 1,
  expiry_warning_days: 7,
  allow_negative_stock: 0,
  auto_order_no: 1,
  onboarding_complete: 0,
}

export function getSettings(): Settings {
  const row = queryOne<Settings>('SELECT * FROM bakery_settings WHERE id = 1')
  if (row) {
    setFormatSettings(row)
    return row
  }
  run(`INSERT OR IGNORE INTO bakery_settings (id) VALUES (1)`)
  const created = queryOne<Settings>('SELECT * FROM bakery_settings WHERE id = 1')!
  setFormatSettings(created)
  return created
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const current = getSettings()
  const next = { ...current, ...patch }
  run(
    `UPDATE bakery_settings SET bakery_name=?, business_type=?, owner_name=?, currency=?,
      currency_symbol=?, currency_position=?, date_format=?, measurement_system=?,
      default_tax_rate=?, default_labor_rate=?, labor_unit=?, overhead_method=?,
      overhead_percent=?, overhead_fixed=?, opening_days=?, default_lead_time_days=?,
      low_stock_warnings=?, expiry_warning_days=?, allow_negative_stock=?,
      auto_order_no=?, onboarding_complete=?, updated_at=? WHERE id=1`,
    [
      next.bakery_name,
      next.business_type,
      next.owner_name,
      next.currency,
      next.currency_symbol,
      next.currency_position,
      next.date_format,
      next.measurement_system,
      Number(next.default_tax_rate) || 0,
      Number(next.default_labor_rate) || 0,
      next.labor_unit,
      next.overhead_method,
      Number(next.overhead_percent) || 0,
      Number(next.overhead_fixed) || 0,
      next.opening_days,
      Number(next.default_lead_time_days) || 0,
      Number(next.low_stock_warnings),
      Number(next.expiry_warning_days) || 7,
      Number(next.allow_negative_stock),
      Number(next.auto_order_no),
      Number(next.onboarding_complete),
      nowIso(),
    ]
  )
  logAudit('settings', '1', 'update', JSON.stringify(Object.keys(patch)))
  const saved = getSettings()
  setFormatSettings(saved)
  return saved
}

export function hasAnyData(): boolean {
  const c = scalar<number>('SELECT COUNT(*) AS c FROM customers') ?? 0
  const o = scalar<number>('SELECT COUNT(*) AS c FROM orders') ?? 0
  const p = scalar<number>('SELECT COUNT(*) AS c FROM products') ?? 0
  return c + o + p > 0
}

export function listUnitConversions(): { id: number; from_unit: string; to_unit: string; factor: number }[] {
  return query('SELECT * FROM unit_conversions ORDER BY from_unit, to_unit')
}

export function addUnitConversion(from: string, to: string, factor: number) {
  run('INSERT INTO unit_conversions (from_unit, to_unit, factor) VALUES (?,?,?)', [from, to, factor])
  logAudit('unit_conversion', null, 'create', `${from}->${to} x${factor}`)
}

export function removeUnitConversion(id: number) {
  run('DELETE FROM unit_conversions WHERE id = ?', [id])
  logAudit('unit_conversion', String(id), 'delete')
}

export const DEFAULT_SETTINGS = DEFAULTS
