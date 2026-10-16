import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/**
 * Pulsante della barra che apre un piccolo menu di scelte con icona (es. allineamento, tipo di elenco).
 * Mostra l'icona della scelta attuale; `items`: [{ value, label, icon, hint }]. `active`: evidenziato come gli altri pulsanti.
 * Frecce su/giù per spostarsi, Invio per scegliere, Esc per chiudere.
 */
export default function ToolbarMenu({ label, icon, items, value, active = false, onSelect }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => { if (!root.current?.contains(event.target)) setOpen(false) }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  useEffect(() => {
    if (open) root.current?.querySelector('[role="menuitemradio"][aria-checked="true"], [role="menuitemradio"]')?.focus()
  }, [open])

  function onKeyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); root.current?.querySelector('button')?.focus(); return }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const buttons = [...root.current.querySelectorAll('[role="menuitemradio"]')]
    const index = buttons.indexOf(document.activeElement)
    const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length
    buttons[next]?.focus()
  }

  return (
    <div ref={root} className="relative" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-0.5 rounded-md py-2 pl-2 pr-1 transition ${active ? 'bg-accent-400 text-slate-950' : open ? 'bg-slate-700 text-slate-50' : 'text-slate-300 hover:bg-slate-700 hover:text-slate-50'}`}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        <ChevronDown size={12} className="opacity-70" />
      </button>
      {open && (
        <div role="menu" aria-label={label} className="absolute left-0 top-full z-30 mt-1 min-w-[12rem] rounded-lg border border-slate-700 bg-slate-900 p-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.value}
              type="button"
              role="menuitemradio"
              aria-checked={item.value === value}
              className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm outline-none transition focus-visible:bg-slate-700 ${item.value === value ? 'text-accent-400' : 'text-slate-200 hover:bg-slate-800'}`}
              onClick={() => { setOpen(false); onSelect(item.value) }}
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint && <span className="shrink-0 text-xs text-slate-500">{item.hint}</span>}
              {item.value === value && <Check size={14} className="shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
