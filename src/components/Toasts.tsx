import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useApp } from '../store/app'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  const dismiss = useApp((s) => s.dismiss)
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2 no-print w-[340px] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => {
        const icon =
          t.kind === 'success' ? (
            <CheckCircle2 size={17} className="text-ok shrink-0" />
          ) : t.kind === 'error' ? (
            <AlertCircle size={17} className="text-bad shrink-0" />
          ) : (
            <Info size={17} className="text-pink-500 shrink-0" />
          )
        return (
          <div
            key={t.id}
            className="card shadow-pop px-4 py-3 flex items-start gap-2.5 animate-[slideIn_.18s_ease-out]"
            role="status"
          >
            <div className="mt-0.5">{icon}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink leading-snug">{t.title}</p>
              {t.message && <p className="text-[12.5px] text-muted mt-0.5 leading-snug break-words">{t.message}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-muted hover:text-ink" aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
