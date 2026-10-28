import { useEffect, useRef, useState } from 'react'
import { Maximize, X, ZoomIn, ZoomOut } from 'lucide-react'
import { t } from '../i18n/index.js'

const MIN_SCALE = 0.05
const MAX_SCALE = 32
const button = 'flex h-8 w-8 items-center justify-center rounded text-slate-200 transition hover:bg-white/15 disabled:opacity-40'

/**
 * Visualizzatore a tutto schermo di un'immagine del documento (qualunque indirizzo: file, incorporata, remota): la rotella ingrandisce attorno al puntatore,
 * il trascinamento sposta, il doppio clic alterna "adatta" e "grandezza reale", Esc chiude. Si chiude anche con un clic sullo sfondo.
 */
export default function ImageViewer({ src, alt, onClose }) {
  const [size, setSize] = useState(null)
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 })
  const stage = useRef(null)
  const dialog = useRef(null)
  const drag = useRef(null)
  const state = useRef({ view, size })
  state.current = { view, size }

  const fitView = (natural) => {
    const box = stage.current.getBoundingClientRect()
    const scale = Math.min(box.width / natural.width, box.height / natural.height, 1)
    return { scale, x: (box.width - natural.width * scale) / 2, y: (box.height - natural.height * scale) / 2 }
  }
  const zoomAt = (factor, cx, cy) => setView((current) => {
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, current.scale * factor))
    const ratio = scale / current.scale
    return { scale, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio }
  })
  const zoomCentered = (factor) => { const box = stage.current.getBoundingClientRect(); zoomAt(factor, box.width / 2, box.height / 2) }
  const toggle = (cx, cy) => {
    const { size: natural, view: current } = state.current
    if (!natural) return
    const fit = fitView(natural)
    if (Math.abs(current.scale - fit.scale) < 0.001 && fit.scale < 1) {
      const ratio = 1 / current.scale
      setView({ scale: 1, x: cx - (cx - current.x) * ratio, y: cy - (cy - current.y) * ratio })
    } else setView(fit)
  }

  useEffect(() => {
    const onKey = (event) => {
      // I tasti gestiti vanno consumati: il fuoco può essere ancora nell'editor sotto, che altrimenti vi scriverebbe il carattere.
      const consume = () => { event.preventDefault(); event.stopPropagation() }
      if (event.key === 'Escape') { consume(); onClose() }
      else if (event.key === '+' || event.key === '=') { consume(); zoomCentered(1.25) }
      else if (event.key === '-') { consume(); zoomCentered(1 / 1.25) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Il fuoco passa al visualizzatore, così nessun altro tasto raggiunge l'editor sottostante; alla chiusura torna dov'era.
  useEffect(() => {
    const previous = document.activeElement
    dialog.current?.focus()
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }) }
  }, [])

  // La rotella non può essere passiva: deve impedire lo scorrimento del documento sotto.
  useEffect(() => {
    const element = stage.current
    const onWheel = (event) => {
      event.preventDefault()
      const box = element.getBoundingClientRect()
      zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX - box.left, event.clientY - box.top)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [])

  const percent = Math.round(view.scale * 100)
  return (
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-label={alt || t('View image')} className="fixed inset-0 z-50 flex flex-col bg-black/90 outline-none">
      <div className="flex shrink-0 items-center gap-1 px-3 py-2 text-xs text-slate-300">
        <span className="min-w-0 flex-1 truncate">{alt}{size ? ` · ${size.width}×${size.height}` : ''}</span>
        <button type="button" aria-label={t('Zoom out')} title={t('Zoom out')} className={button} disabled={!size} onClick={() => zoomCentered(1 / 1.25)}><ZoomOut size={16} /></button>
        <span className="w-12 text-center tabular-nums">{percent}%</span>
        <button type="button" aria-label={t('Zoom in')} title={t('Zoom in')} className={button} disabled={!size} onClick={() => zoomCentered(1.25)}><ZoomIn size={16} /></button>
        <button type="button" aria-label={t('Fit to window')} title={t('Fit to window')} className={button} disabled={!size} onClick={() => setView(fitView(size))}><Maximize size={16} /></button>
        <button type="button" aria-label={t('Close')} title={t('Close')} className={button} onClick={onClose}><X size={17} /></button>
      </div>
      <div
        ref={stage}
        className={`relative min-h-0 flex-1 touch-none select-none overflow-hidden ${drag.current ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, view: state.current.view, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={(event) => {
          if (!drag.current) return
          const dx = event.clientX - drag.current.x
          const dy = event.clientY - drag.current.y
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.current.moved = true
          setView({ ...drag.current.view, x: drag.current.view.x + dx, y: drag.current.view.y + dy })
        }}
        onPointerUp={(event) => { const moved = drag.current?.moved; drag.current = null; if (!moved && event.target === event.currentTarget) onClose() }}
        onPointerCancel={() => { drag.current = null }}
        onDoubleClick={(event) => { const box = stage.current.getBoundingClientRect(); toggle(event.clientX - box.left, event.clientY - box.top) }}
      >
        <img
          src={src}
          alt={alt || ''}
          draggable={false}
          className="absolute left-0 top-0 max-w-none"
          style={{ transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, imageRendering: view.scale >= 4 ? 'pixelated' : 'auto', visibility: size ? 'visible' : 'hidden' }}
          onLoad={(event) => {
            const natural = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight }
            setSize(natural)
            setView(fitView(natural))
          }}
        />
      </div>
    </div>
  )
}
