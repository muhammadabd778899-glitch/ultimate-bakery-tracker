import type { Settings } from '../types'
import { round2 } from './money'

let settings: Partial<Settings> = {
  currency_symbol: '$',
  currency_position: 'prefix',
  date_format: 'YYYY-MM-DD',
}

export function setFormatSettings(s: Partial<Settings> | null | undefined) {
  if (s) settings = { ...settings, ...s }
}

export function formatMoney(value: number | null | undefined, opts?: { compact?: boolean; sign?: boolean }): string {
  const n = round2(Number(value ?? 0))
  const symbol = settings.currency_symbol ?? '$'
  const position = settings.currency_position ?? 'prefix'
  const abs = Math.abs(n)
  const body = opts?.compact && abs >= 1_000_000
    ? (abs / 1_000_000).toFixed(1) + 'M'
    : abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const sign = n < 0 ? '-' : opts?.sign && n > 0 ? '+' : ''
  return position === 'suffix' ? `${sign}${body} ${symbol}` : `${sign}${symbol}${body}`
}

export function formatQty(value: number | null | undefined, places = 2): string {
  const n = Number(value ?? 0)
  if (Number.isInteger(n)) return n.toLocaleString('en-US')
  return n.toLocaleString('en-US', { maximumFractionDigits: places })
}

export function formatPct(value: number | null | undefined): string {
  const n = Number(value ?? 0)
  return `${n.toFixed(1)}%`
}

export function getDateFormat(): string {
  return settings.date_format ?? 'YYYY-MM-DD'
}

export function getCurrency(): string {
  return settings.currency ?? 'USD'
}
