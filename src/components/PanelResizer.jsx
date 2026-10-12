import { useRef } from 'react'
import { t } from '../i18n/index.js'

const KEY_STEP = 16

/**
 * Maniglia per ridimensionare in larghezza un pannello laterale. Va messa dentro il pannello (che deve essere `relative`).
 * `side` è il lato del pannello: 'left' = pannello a sinistra (maniglia sul bordo destro), 'right' = pannello a destra.
 * Si trascina con il mouse (anche sopra le schede del browser, grazie al pointer capture), si usa con le frecce
 * (Maiusc = passo grande) e un doppio clic ripristina la larghezza predefinita.
 */
export default function PanelResizer({ side, width, min, max, defaultWidth, label, onChange, onCommit }) {
  const drag = useRef(null)
  const growsWith = side === 'left' ? 1 : -1 // verso destra il pannello sinistro cresce, quello destro si restringe

  function begin(event) {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { startX: event.clientX, startWidth: width }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  function move(event) {
    if (!drag.current) return
    onChange(drag.current.startWidth + growsWith * (event.clientX - drag.current.startX))
  }

  function end() {
    if (!drag.current) return
    drag.current = null
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    onCommit()
  }

  function onKeyDown(event) {
    const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP
    let next = null
    if (event.key === 'ArrowRight') next = width + growsWith * step
    else if (event.key === 'ArrowLeft') next = width - growsWith * step
    else if (event.key === 'Home') next = min
    else if (event.key === 'End') next = max
    if (next === null) return
    event.preventDefault()
    onChange(next)
    onCommit()
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={Math.round(max)}
      tabIndex={0}
      title={t('Drag to resize, double-click to reset')}
      className={`group absolute inset-y-0 z-10 flex w-2 cursor-col-resize touch-none justify-center outline-none ${side === 'left' ? '-right-1' : '-left-1'}`}
      onPointerDown={begin}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      onDoubleClick={() => { onChange(defaultWidth); onCommit() }}
    >
      <span className="h-full w-px bg-transparent transition group-hover:w-0.5 group-hover:bg-accent-500/70 group-focus-visible:w-0.5 group-focus-visible:bg-accent-500" />
    </div>
  )
}
