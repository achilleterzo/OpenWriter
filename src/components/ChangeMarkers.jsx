import { useEffect, useState } from 'react'
import { t } from '../i18n/index.js'

const MIN_GAP_PX = 6

const kinds = {
  pending: { color: 'bg-emerald-400', label: () => t('Edit to review') },
  suggestion: { color: 'bg-amber-400', label: () => t('Suggestion') },
  comment: { color: 'bg-accent-400', label: () => t('Comment') },
}

/**
 * Striscia di segnalini sul lato sinistro del documento, come una barra di scorrimento a marcatori: uno per ogni modifica dell'assistente
 * ancora da rivedere (verde), per ogni suggerimento aperto (ambra) e per ogni commento aperto (colore d'accento). La posizione è
 * proporzionale al punto del documento; un clic scorre fin lì (e, per una nota, la seleziona).
 * `containerRef`: l'elemento `relative` che contiene lo scorrimento del documento (`[data-document-scroll]`).
 */
export default function ChangeMarkers({ editor, containerRef, onSelectNote }) {
  const [markers, setMarkers] = useState([])

  useEffect(() => {
    if (!editor) return undefined
    let frame = null
    const scroller = () => containerRef.current?.querySelector('[data-document-scroll]')

    const compute = () => {
      frame = null
      const element = scroller()
      if (!element || !element.scrollHeight) { setMarkers([]); return }
      const origin = element.getBoundingClientRect().top - element.scrollTop
      const found = []
      element.querySelectorAll('.ow-pending-widget').forEach((node) => found.push({ kind: 'pending', top: node.getBoundingClientRect().top - origin }))
      // Una nota può essere divisa in più pezzi di testo (grassetti, collegamenti…): conta il primo.
      const seen = new Set()
      element.querySelectorAll('.ow-note[data-note-id]').forEach((node) => {
        const id = node.getAttribute('data-note-id')
        if (seen.has(id)) return
        seen.add(id)
        found.push({ kind: node.classList.contains('ow-note-suggestion') ? 'suggestion' : 'comment', id, top: node.getBoundingClientRect().top - origin })
      })
      found.sort((left, right) => left.top - right.top)
      const total = element.scrollHeight
      setMarkers((previous) => {
        const next = found.map((item, index) => ({ ...item, key: `${item.kind}-${item.id || index}`, ratio: Math.min(1, Math.max(0, item.top / total)) }))
        const same = previous.length === next.length && previous.every((item, index) => item.key === next[index].key && Math.abs(item.ratio - next[index].ratio) < 0.0005)
        return same ? previous : next
      })
    }
    const schedule = () => { if (frame === null) frame = requestAnimationFrame(compute) }

    // Le decorazioni (note, modifiche in sosta) si disegnano dopo la transazione; il contenuto cambia altezza anche quando le immagini si caricano.
    editor.on('transaction', schedule)
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null
    const content = scroller()?.firstElementChild
    if (content) observer?.observe(content)
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      editor.off('transaction', schedule)
      observer?.disconnect()
      window.removeEventListener('resize', schedule)
    }
  }, [editor, containerRef])

  if (!markers.length) return null

  function jump(marker) {
    const element = containerRef.current?.querySelector('[data-document-scroll]')
    if (!element) return
    element.scrollTo({ top: Math.max(0, marker.top - 96), behavior: 'smooth' })
    if (marker.id) onSelectNote?.(marker.id)
  }

  // Segnalini vicini (meno di MIN_GAP_PX) restano sovrapposti: ognuno resta cliccabile, quello sopra è l'ultimo.
  return (
    <div aria-label={t('Edits and notes to review')} role="group" className="pointer-events-none absolute bottom-0 left-0 top-0 z-10 w-3">
      {markers.map((marker) => {
        const kind = kinds[marker.kind]
        return (
          <button
            key={marker.key}
            type="button"
            title={kind.label()}
            aria-label={kind.label()}
            style={{ top: `calc(${(marker.ratio * 100).toFixed(3)}% - ${MIN_GAP_PX / 2}px)` }}
            className={`pointer-events-auto absolute left-0 h-1.5 w-3 rounded-r-sm opacity-80 transition hover:w-4 hover:opacity-100 ${kind.color}`}
            onClick={() => jump(marker)}
          />
        )
      })}
    </div>
  )
}
