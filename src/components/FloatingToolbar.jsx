import { useEffect, useLayoutEffect, useRef, useState } from 'react'

const GAP = 8
const EDGE = 8

/**
 * Barra fluttuante agganciata alla selezione dell'editor (o al cursore): sta sopra il testo selezionato e passa sotto se non c'è posto.
 * È generica: il contenuto lo decide chi la usa (collegamenti, formattazione rapida…), che dice anche quando mostrarla con `open`.
 * `containerRef`: l'elemento `relative` che contiene l'editor e il suo scorrimento (`[data-document-scroll]`): la barra vi è posizionata
 * dentro e si nasconde se il testo scorre fuori vista. I clic sui pulsanti non tolgono il focus all'editor; i campi di testo sì, e
 * la selezione resta (l'editor la conserva anche senza focus).
 */
export default function FloatingToolbar({ editor, containerRef, open, children, className = '', label }) {
  const ref = useRef(null)
  const [position, setPosition] = useState(null)
  const [, setTick] = useState(0)

  // Ogni cambio di selezione, ogni modifica, lo scorrimento e il ridimensionamento richiedono di ricalcolare la posizione.
  useEffect(() => {
    if (!open || !editor) return undefined
    const refresh = () => setTick((value) => value + 1)
    const scroller = containerRef.current?.querySelector('[data-document-scroll]')
    editor.on('selectionUpdate', refresh)
    editor.on('transaction', refresh)
    scroller?.addEventListener('scroll', refresh)
    window.addEventListener('resize', refresh)
    return () => {
      editor.off('selectionUpdate', refresh)
      editor.off('transaction', refresh)
      scroller?.removeEventListener('scroll', refresh)
      window.removeEventListener('resize', refresh)
    }
  }, [editor, containerRef, open])

  // Senza dipendenze: si rilegge a ogni rendering; lo stato cambia solo se la posizione è davvero diversa.
  useLayoutEffect(() => {
    if (!open) { if (position) setPosition(null); return }
    const container = containerRef.current
    const element = ref.current
    if (!container || !element || !editor || editor.isDestroyed) return
    let start
    let end
    try {
      const { from, to } = editor.state.selection
      start = editor.view.coordsAtPos(from)
      end = editor.view.coordsAtPos(to)
    } catch {
      return
    }
    const box = container.getBoundingClientRect()
    const width = element.offsetWidth
    const height = element.offsetHeight
    const left = Math.min(start.left, end.left)
    const right = Math.max(start.right, end.right)
    const top = Math.min(start.top, end.top)
    const bottom = Math.max(start.bottom, end.bottom)
    let next
    if (bottom < box.top || top > box.bottom) {
      next = { hidden: true, x: 0, y: 0 }
    } else {
      let y = top - box.top - height - GAP
      if (y < EDGE / 2) y = bottom - box.top + GAP
      const x = Math.max(EDGE, Math.min((left + right) / 2 - box.left - width / 2, box.width - width - EDGE))
      next = { hidden: false, x: Math.round(x), y: Math.round(y) }
    }
    if (!position || position.hidden !== next.hidden || position.x !== next.x || position.y !== next.y) setPosition(next)
  })

  if (!open) return null

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      style={{ left: position?.x ?? 0, top: position?.y ?? 0, visibility: position && !position.hidden ? 'visible' : 'hidden' }}
      className={`absolute z-20 flex items-center gap-0.5 rounded-lg border border-slate-700 bg-slate-900 p-1 text-sm text-slate-200 shadow-xl ${className}`}
      onMouseDown={(event) => { if (!event.target.closest('input, textarea')) event.preventDefault() }}
    >
      {children}
    </div>
  )
}

// Separatore verticale tra gruppi di pulsanti.
export const FloatingDivider = () => <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-slate-700" />

// Pulsante a icona per le barre fluttuanti. `active`: lo stile è attivo sulla selezione (grassetto, corsivo…).
export function FloatingButton({ label, onClick, children, danger = false, disabled = false, active = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      aria-pressed={active || undefined}
      className={`flex h-7 w-7 items-center justify-center rounded transition disabled:opacity-40 ${danger ? 'text-slate-400 hover:bg-rose-500/15 hover:text-rose-300' : active ? 'bg-accent-500/20 text-accent-300' : 'text-slate-300 hover:bg-slate-700 hover:text-slate-50'}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
