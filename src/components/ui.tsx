import React from 'react'
import { X, Search, Loader2, Inbox } from 'lucide-react'
import { formatMoney } from '../lib/format'

/* ================================ Layout ================================ */

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="font-display text-[26px] leading-tight text-ink">{title}</h1>
        {subtitle && <p className="text-sm text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  )
}

export function Card({
  children,
  className = '',
  title,
  action,
}: {
  children: React.ReactNode
  className?: string
  title?: string
  action?: React.ReactNode
}) {
  return (
    <section className={`card ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between px-5 py-3.5 border-b border-line">
          <h3 className="section-title">{title}</h3>
          {action}
        </header>
      )}
      {children}
    </section>
  )
}

export function Grid({ children, cols = 4, className = '' }: { children: React.ReactNode; cols?: number; className?: string }) {
  const map: Record<number, string> = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
    5: 'sm:grid-cols-3 lg:grid-cols-5',
    6: 'sm:grid-cols-3 lg:grid-cols-6',
  }
  return <div className={`grid gap-4 ${map[cols] ?? map[4]} ${className}`}>{children}</div>
}

/* ================================ Forms ================================ */

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className = '',
}: {
  label: string
  hint?: string
  error?: string
  required?: boolean
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={className}>
      <label className="label">
        {label}
        {required && <span className="text-pink-600 ml-0.5">*</span>}
      </label>
      {children}
      {error ? <p className="err">{error}</p> : hint ? <p className="hint">{hint}</p> : null}
    </div>
  )
}

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className = '', ...rest }, ref) {
    return <input ref={ref} className={`input ${className}`} {...rest} />
  }
)

export const TextArea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function TextArea({ className = '', ...rest }, ref) {
    return <textarea ref={ref} className={`textarea ${className}`} {...rest} />
  }
)

export const SelectInput = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function SelectInput({ className = '', children, ...rest }, ref) {
    return (
      <select ref={ref} className={`input ${className}`} {...rest}>
        {children}
      </select>
    )
  }
)

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={`relative ${className}`}>
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input
        className="input pl-9"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        type="search"
      />
    </div>
  )
}

/* ================================ Overlays ================================ */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  if (!open) return null
  const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8 no-print">
      <div className="fixed inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className={`relative w-full ${widths[size]} card shadow-pop animate-[fadeIn_.15s_ease-out]`}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-line">
          <h3 className="font-display text-lg text-ink">{title}</h3>
          <button className="btn-ghost !h-8 !px-2" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </header>
        <div className="px-5 py-4 max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <footer className="flex justify-end gap-2 px-5 py-3.5 border-t border-line bg-warm rounded-b-2xl">{footer}</footer>}
      </div>
    </div>
  )
}

export function Confirm({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
  busy,
}: {
  open: boolean
  title: string
  message: React.ReactNode
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 size={15} className="animate-spin" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-ink leading-relaxed">{message}</div>
    </Modal>
  )
}

/* ================================ Feedback ================================ */

type Tone = 'neutral' | 'pink' | 'success' | 'warning' | 'danger' | 'info'

const TONES: Record<Tone, string> = {
  neutral: 'bg-surface text-muted',
  pink: 'bg-pink-100 text-pink-700',
  success: 'bg-[#EAF4EE] text-[#4C7C61]',
  warning: 'bg-[#FCF1E1] text-[#9A6A28]',
  danger: 'bg-[#FBEAEB] text-[#A9505A]',
  info: 'bg-pink-100 text-pink-700',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>
}

export const STATUS_TONE: Record<string, Tone> = {
  Inquiry: 'neutral',
  Quoted: 'warning',
  Confirmed: 'pink',
  'In Production': 'info',
  Ready: 'success',
  Completed: 'success',
  Cancelled: 'danger',
  Unpaid: 'danger',
  'Partially Paid': 'warning',
  Paid: 'success',
  Refunded: 'danger',
  Planned: 'neutral',
  Preparing: 'info',
  Baking: 'info',
  Cooling: 'info',
  Decorating: 'info',
  Packaging: 'info',
  Failed: 'danger',
  'To Do': 'neutral',
  'In Progress': 'warning',
  'High': 'danger',
  'Normal': 'neutral',
  'Low': 'neutral',
  active: 'success',
  inactive: 'neutral',
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-muted text-sm">
      <Loader2 size={18} className="animate-spin text-pink-500" />
      {label ?? 'Loading…'}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string
  description?: string
  action?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="w-16 h-16 rounded-2xl bg-pink-100 text-pink-500 flex items-center justify-center mb-4">
        {icon ?? <Inbox size={26} />}
      </div>
      <p className="empty-title">{title}</p>
      {description && <p className="text-sm text-muted mt-1.5 max-w-md leading-relaxed">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ProgressBar({ value, max = 100, tone = 'pink' }: { value: number; max?: number; tone?: 'pink' | 'success' | 'warning' }) {
  const pctv = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  const color = tone === 'success' ? 'bg-ok' : tone === 'warning' ? 'bg-warn' : 'bg-pink-400'
  return (
    <div className="h-1.5 w-full rounded-full bg-pink-100 overflow-hidden">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pctv}%` }} />
    </div>
  )
}

export function Money({ value, className = '' }: { value: number; className?: string }) {
  return <span className={`tnum ${className}`}>{formatMoney(value)}</span>
}

export function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-lg bg-ink text-white text-[11px] px-2 py-1 opacity-0 group-hover:opacity-100 transition z-30">
        {text}
      </span>
    </span>
  )
}

/* ================================ Tables ================================ */

export function TableWrap({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse min-w-[640px]">{children}</table>
    </div>
  )
}

export function THead({ cols }: { cols: (string | React.ReactNode)[] }) {
  return (
    <thead className="bg-warm border-b border-line">
      <tr>
        {cols.map((c, i) => (
          <th key={i} className="th">
            {c}
          </th>
        ))}
      </tr>
    </thead>
  )
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#F3C9CD] bg-[#FBEAEB] text-[#8E414A] text-sm px-4 py-3">{children}</div>
  )
}

export function SuccessNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#CBE3D5] bg-[#EAF4EE] text-[#3F6C53] text-sm px-4 py-3">{children}</div>
  )
}
