import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { dismiss, subscribe } from '../lib/toasts.js'
import { t } from '../i18n/index.js'

// Colori dei quattro livelli: il tema chiaro li adatta da solo (sono variabili CSS).
const LEVELS = {
  info: { icon: Info, bar: 'bg-accent-400', text: 'text-accent-400' },
  success: { icon: CheckCircle2, bar: 'bg-emerald-400', text: 'text-emerald-400' },
  warning: { icon: AlertTriangle, bar: 'bg-amber-400', text: 'text-amber-400' },
  error: { icon: XCircle, bar: 'bg-rose-400', text: 'text-rose-400' },
}

/** Pila di notifiche in basso a destra: il clic apre/chiude il dettaglio, la X le chiude. */
export default function ToastHost() {
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(null)
  useEffect(() => subscribe(setItems), [])
  if (!items.length) return null

  return (
    <div className="pointer-events-none fixed bottom-8 right-4 z-[60] flex w-96 max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
      {items.map((item) => {
        const { icon: Icon, bar, text } = LEVELS[item.level]
        const expanded = open === item.id
        return (
          <div key={item.id} role={item.level === 'error' ? 'alert' : 'status'} className="pointer-events-auto flex overflow-hidden rounded-lg border border-slate-700 bg-slate-900 text-sm text-slate-200 shadow-xl">
            <span className={`w-1.5 shrink-0 ${bar}`} aria-hidden="true" />
            <button type="button" className="flex min-w-0 flex-1 items-start gap-2.5 px-3 py-2.5 text-left" onClick={() => item.detail && setOpen(expanded ? null : item.id)} title={item.detail ? t('Show details') : undefined}>
              <Icon size={16} className={`mt-0.5 shrink-0 ${text}`} />
              <span className="min-w-0 flex-1">
                <span className={`block break-words ${expanded ? '' : 'line-clamp-3'}`}>{item.message}{item.count > 1 && <span className="ml-1.5 rounded bg-slate-800 px-1 text-xs text-slate-400">×{item.count}</span>}</span>
                {expanded && item.detail && <pre className="mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-400">{item.detail}</pre>}
              </span>
            </button>
            <button type="button" aria-label={t('Close')} title={t('Close')} className="shrink-0 px-2 text-slate-500 transition hover:text-slate-100" onClick={() => dismiss(item.id)}><X size={14} /></button>
          </div>
        )
      })}
    </div>
  )
}
