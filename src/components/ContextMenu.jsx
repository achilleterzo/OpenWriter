import { createContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Apre un menu contestuale: openMenu({ x, y, items }). Fornito da App, usato da chi vuole un menu.
export const ContextMenuContext = createContext(() => {})

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
export const modKey = isMac ? '⌘' : 'Ctrl+'

const isActionable = (item) => !item.separator && !item.disabled

/**
 * Menu contestuale disegnato dall'app: angoli squadrati e bordo sottile, come i menu classici di Windows, nei colori del tema.
 * Item: { label, hint?, bold?, danger?, disabled?, separator?, onClick }.
 * Il focus resta dov'era (editor o campo di testo), così Taglia / Incolla / Sostituisci agiscono sull'elemento giusto.
 */
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ left: x, top: y })
  const [active, setActive] = useState(-1)
  const activeRef = useRef(-1)
  activeRef.current = active

  // Resta dentro la finestra anche se aperto vicino al bordo.
  useLayoutEffect(() => {
    const { width, height } = ref.current.getBoundingClientRect()
    setPosition({ left: Math.max(4, Math.min(x, window.innerWidth - width - 4)), top: Math.max(4, Math.min(y, window.innerHeight - height - 4)) })
  }, [x, y, items])

  useEffect(() => {
    const move = (direction) => {
      const indexes = items.map((item, index) => (isActionable(item) ? index : -1)).filter((index) => index >= 0)
      if (!indexes.length) return
      const position = indexes.indexOf(activeRef.current)
      const next = direction === 'first' ? 0 : direction === 'last' ? indexes.length - 1 : (position + direction + indexes.length) % indexes.length
      setActive(indexes[position === -1 && direction === -1 ? indexes.length - 1 : next])
    }
    const run = (item) => { onClose(); item.onClick?.() }

    const onKeyDown = (event) => {
      const handled = { Escape: () => onClose(), ArrowDown: () => move(1), ArrowUp: () => move(-1), Home: () => move('first'), End: () => move('last') }[event.key]
      if (handled) { event.preventDefault(); event.stopPropagation(); handled(); return }
      if ((event.key === 'Enter' || event.key === ' ') && items[activeRef.current] && isActionable(items[activeRef.current])) {
        event.preventDefault()
        event.stopPropagation()
        run(items[activeRef.current])
      }
    }
    const onPointerDown = (event) => { if (!ref.current?.contains(event.target)) onClose() }

    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('mousedown', onPointerDown, true)
    window.addEventListener('contextmenu', onPointerDown, true)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    window.addEventListener('wheel', onClose, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('mousedown', onPointerDown, true)
      window.removeEventListener('contextmenu', onPointerDown, true)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('wheel', onClose)
    }
  }, [items, onClose])

  return (
    <div
      ref={ref}
      role="menu"
      style={position}
      className="fixed z-50 min-w-48 max-w-80 select-none border border-slate-600 bg-slate-800 py-1 text-sm text-slate-100 shadow-xl"
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) => (item.separator
        ? <div key={index} role="separator" className="my-1 border-t border-slate-600" />
        : (
          <button
            key={index}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            // Non toglie il focus all'editor o al campo di testo su cui si sta agendo.
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => isActionable(item) && setActive(index)}
            onClick={() => { onClose(); item.onClick?.() }}
            className={`flex w-full items-center justify-between gap-8 px-4 py-1.5 text-left disabled:cursor-default disabled:opacity-40 ${index === active ? 'bg-slate-600' : ''} ${item.danger ? 'text-rose-400' : ''} ${item.bold ? 'font-semibold' : ''}`}
          >
            <span className="truncate">{item.label}</span>
            {item.hint && <span className="shrink-0 text-xs text-slate-400">{item.hint}</span>}
          </button>
        )))}
    </div>
  )
}
