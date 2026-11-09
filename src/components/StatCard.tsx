import React from 'react'
import { Link } from 'react-router-dom'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { Card, Tooltip } from './ui'

const TONES = {
  neutral: {
    value: 'text-ink',
    tile: 'from-[#FFE1EA] to-[#FFF6EC] text-[#C93E6B]',
    wash: 'from-white via-white to-[#FFF1F5]',
    bar: 'from-[#FBA3BE] to-[#E35683]'
  },
  good: {
    value: 'text-[#2F7A56]',
    tile: 'from-[#DFF5E8] to-[#F4FCF8] text-[#2F8F63]',
    wash: 'from-white via-white to-[#EDF9F2]',
    bar: 'from-[#9CE2C4] to-[#3FA372]'
  },
  bad: {
    value: 'text-[#B33F52]',
    tile: 'from-[#FFE4E2] to-[#FFF6F3] text-[#C8545F]',
    wash: 'from-white via-white to-[#FFF1EE]',
    bar: 'from-[#F6A290] to-[#D9536B]'
  },
  warn: {
    value: 'text-[#9A6415]',
    tile: 'from-[#FFF0CC] to-[#FFFBF0] text-[#B07A17]',
    wash: 'from-white via-white to-[#FFF9EA]',
    bar: 'from-[#F8D98A] to-[#E7A13B]'
  }
} as const

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
  const t = TONES[tone]
  const body = (
    <Card className={`card-lift relative overflow-hidden p-4 h-full bg-gradient-to-br ${t.wash}`}>
      <span className={`absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${t.bar}`} />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium text-muted leading-snug">{label}</p>
        {hint && (
          <Tooltip text={hint}>
            <span className="text-[10px] text-muted border border-line bg-white/70 rounded-full w-4 h-4 grid place-items-center cursor-help shrink-0">
              ?
            </span>
          </Tooltip>
        )}
      </div>
      <div className="flex items-end justify-between gap-2 mt-2.5">
        <p className={`text-[27px] font-semibold tnum leading-none tracking-tight ${t.value}`}>{value}</p>
        {icon && (
          <span className={`w-9 h-9 rounded-xl grid place-items-center bg-gradient-to-br ${t.tile} shrink-0 shadow-sm`}>
            {icon}
          </span>
        )}
      </div>
      {sub && <p className="text-[11.5px] text-muted mt-2">{sub}</p>}
    </Card>
  )
  return to ? <Link to={to} className="block">{body}</Link> : <div className="block">{body}</div>
}

export function DeltaIcon({ value }: { value: number }) {
  if (value === 0) return null
  return value > 0 ? <TrendingUp size={14} className="text-ok" /> : <TrendingDown size={14} className="text-bad" />
}
