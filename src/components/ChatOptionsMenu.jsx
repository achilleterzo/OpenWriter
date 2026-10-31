import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { t } from '../i18n/index.js'

/**
 * Menu a tre punti con le opzioni della chat (sforzo, temperatura, approvazione), in una tendina sopra il pulsante.
 * Si chiude con un clic fuori o con Esc.
 */
export default function ChatOptionsMenu({ children }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDown = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div ref={root} className="relative shrink-0">
      <button
        type="button"
        aria-label={t('Chat options')}
        title={t('Chat options')}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`rounded border border-slate-700 px-1.5 py-1 text-slate-300 outline-none transition hover:text-slate-50 focus:border-accent-400 ${open ? 'bg-slate-700' : 'bg-slate-800'}`}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={14} />
      </button>
      {open && (
        <div role="dialog" aria-label={t('Chat options')} className="absolute bottom-full right-0 z-30 mb-1 grid w-64 max-w-[calc(100vw-2rem)] gap-3 rounded-md border border-slate-700 bg-slate-950 p-3 text-xs text-slate-400 shadow-lg">
          {children}
        </div>
      )}
    </div>
  )
}
