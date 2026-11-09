import React from 'react'
import { Link } from 'react-router-dom'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Card, Tooltip } from './ui'

export function StatCard({
  label,
  value,
  sub,
  icon,
  to,
  tone = 'neutral',
  hint,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  icon?: React.ReactNode
  to?: string
  tone?: 'neutral' | 'good' | 'bad' | 'warn'
  hint?: string
}) {
  const accent =
    tone === 'good'
      ? 'text-ok'
      : tone === 'bad'
        ? 'text-bad'
        : tone === 'warn'
          ? 'text-warn'
          : 'text-pink-500'
  const body = (
    <Card className="p-4 h-full transition hover:shadow-pop hover:border-pink-200">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-muted leading-snug">{label}</p>
        {hint && (
          <Tooltip text={hint}>
            <span className="text-[10px] text-muted border border-line rounded-full w-4 h-4 grid place-items-center cursor-help">
              ?
            </span>
          </Tooltip>
        )}
      </div>
      <div className="flex items-end justify-between gap-2 mt-2">
        <p className={`text-[26px] font-semibold tnum leading-none ${accent}`}>{value}</p>
        {icon && <span className={`${accent} opacity-70`}>{icon}</span>}
      </div>
      {sub && <p className="text-[11.5px] text-muted mt-1.5">{sub}</p>}
    </Card>
  )
  return to ? <Link to={to} className="block">{body}</Link> : <div className="block">{body}</div>
}

export function DeltaIcon({ value }: { value: number }) {
  if (value === 0) return null
  return value > 0 ? <TrendingUp size={14} className="text-ok" /> : <TrendingDown size={14} className="text-bad" />
}
