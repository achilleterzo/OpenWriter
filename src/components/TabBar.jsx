import { useContext, useEffect, useRef, useState } from 'react'
import { FileText, Globe, Image as ImageIcon, PanelRight, Pin, Plus, SaveAll, X } from 'lucide-react'
import { ContextMenuContext } from './ContextMenu.jsx'
import { t } from '../i18n/index.js'

// Altezza di una scheda (riga di testo + bordo): i pulsanti fissi la tengono, senza allungarsi quando la zona delle schede mostra la barra di scorrimento.
const FIXED = 'h-[38px] shrink-0 self-start'

export default function TabBar({ tabs, onPromote, unsavedCount = 0, onSaveAll, activeId, onSelect, onClose, onTogglePin, onMove, onNew, onNewBrowser, assistantOpen, onToggleAssistant }) {
  const openMenu = useContext(ContextMenuContext)
  const dragging = useRef(null)
  const [dropTarget, setDropTarget] = useState(null)
  const list = useRef(null)
  // Indicatore di scorrimento: solo ampiezza e posizione (frazioni 0-1 della larghezza), nullo se le schede entrano tutte.
  const [thumb, setThumb] = useState(null)

  // Senza barra di scorrimento (che lascerebbe una fascia vuota sotto i pulsanti fissi): la rotella scorre le schede in orizzontale
  // e la scheda attiva si porta sempre in vista.
  useEffect(() => {
    const element = list.current
    if (!element) return undefined
    const onWheel = (event) => {
      if (element.scrollWidth <= element.clientWidth || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return
      event.preventDefault()
      element.scrollLeft += event.deltaY
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    const update = () => {
      const overflow = element.scrollWidth - element.clientWidth
      setThumb(overflow > 1 ? { width: element.clientWidth / element.scrollWidth, left: element.scrollLeft / element.scrollWidth } : null)
    }
    update()
    element.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(element)
    for (const child of element.children) observer.observe(child)
    return () => { element.removeEventListener('wheel', onWheel); element.removeEventListener('scroll', update); observer.disconnect() }
  }, [tabs.length])
  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeId, tabs.length])

  return (
    <div className="flex shrink-0 items-stretch border-b border-slate-800 bg-slate-950">
      {/* Nuovo documento e browser stanno fuori dalla zona scorrevole: restano a portata di clic con molte schede aperte. */}
      <button type="button" aria-label={t('Open the browser')} title={t('New browser tab')} className={`${FIXED} border-r border-slate-800 px-3 text-slate-500 transition hover:bg-slate-900 hover:text-slate-50`} onClick={onNewBrowser}>
        <Globe size={16} />
      </button>
      <button type="button" aria-label={t('New document')} title={t('New document (Ctrl+N)')} className={`${FIXED} border-r border-slate-800 px-3 text-slate-500 transition hover:bg-slate-900 hover:text-slate-50`} onClick={onNew}>
        <Plus size={16} />
      </button>
      <div className="relative flex min-w-0 flex-1">
      <div ref={list} role="tablist" aria-label={t('Open documents')} className="flex min-w-0 flex-1 items-stretch overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={tab.filePath || tab.sourcePath || tab.imagePath || tab.title}
            className={`group flex ${tab.pinned ? 'max-w-40' : 'max-w-56'} shrink-0 cursor-pointer ${dropTarget === tab.id ? 'ring-1 ring-inset ring-accent-400' : ''} items-center gap-2 border-r border-t-2 border-r-slate-800 px-3 py-2 text-sm transition ${active ? 'border-t-accent-400 bg-slate-900 text-slate-100' : 'border-t-transparent text-slate-500 hover:bg-slate-900/60 hover:text-slate-300'}`}
            draggable
            onDragStart={(event) => { dragging.current = tab.id; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', tab.id) }}
            onDragOver={(event) => { if (dragging.current && dragging.current !== tab.id) { event.preventDefault(); setDropTarget(tab.id) } }}
            onDragLeave={() => setDropTarget((current) => (current === tab.id ? null : current))}
            onDrop={(event) => { event.preventDefault(); if (dragging.current) onMove(dragging.current, tab.id); dragging.current = null; setDropTarget(null) }}
            onDragEnd={() => { dragging.current = null; setDropTarget(null) }}
            onContextMenu={(event) => {
              event.preventDefault()
              openMenu({ x: event.clientX, y: event.clientY, items: [
                tab.kind !== 'browser' && tab.kind !== 'image' && { label: tab.pinned ? t('Unpin tab') : t('Pin tab'), onClick: () => onTogglePin(tab.id) },
                { label: t('Close'), onClick: () => onClose(tab.id) },
              ].filter(Boolean) })
            }}
            onClick={() => onSelect(tab.id)}
            onDoubleClick={() => { if (tab.preview) onPromote?.(tab.id) }}
            onAuxClick={(event) => { if (event.button === 1) onClose(tab.id) }}
          >
            {tab.kind === 'browser' ? <Globe size={14} className="shrink-0" /> : tab.kind === 'image' ? <ImageIcon size={14} className="shrink-0" /> : <FileText size={14} className="shrink-0" />}
            <span className={`truncate ${tab.closed ? 'italic opacity-60' : tab.preview ? 'italic' : ''}`} title={tab.preview ? t('Preview: it is replaced by the next file you open, until you work on it. Double-click to keep it.') : undefined}>{tab.title}</span>
            {tab.kind !== 'browser' && tab.kind !== 'image' && (
              <button
                type="button"
                aria-label={tab.pinned ? t('Unpin tab') : t('Pin tab')}
                aria-pressed={Boolean(tab.pinned)}
                title={tab.pinned ? t('Unpin tab') : t('Pin tab')}
                className={`shrink-0 rounded p-0.5 transition hover:bg-slate-700 ${tab.pinned ? 'text-accent-400' : 'text-slate-600 hover:text-accent-300'}`}
                onClick={(event) => { event.stopPropagation(); onTogglePin(tab.id) }}
              ><Pin size={13} fill={tab.pinned ? 'currentColor' : 'none'} /></button>
            )}
            <button
              type="button"
              aria-label={t('Close {title}', { title: tab.title })}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-700 hover:text-slate-50"
              onClick={(event) => { event.stopPropagation(); onClose(tab.id) }}
            >
              {tab.dirty && <span className="h-2 w-2 rounded-full bg-accent-400 group-hover:hidden" />}
              <X size={13} className={tab.dirty ? 'hidden group-hover:block' : ''} />
            </button>
          </div>
        )
      })}
      </div>
      {thumb && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5">
          <div className="absolute h-full rounded-full bg-slate-400/30" style={{ left: `${thumb.left * 100}%`, width: `${thumb.width * 100}%` }} />
        </div>
      )}
      </div>
      {/* Sempre visibile; si attiva solo con più di un documento da salvare (uno solo si salva col suo Ctrl+S). */}
      <button
        type="button"
        aria-label={t('Save all')}
        title={unsavedCount > 1 ? t('Save all modified documents ({count})', { count: unsavedCount }) : t('Save all (available with more than one modified document)')}
        disabled={unsavedCount <= 1}
        className={`${FIXED} relative -ml-px border-l border-slate-800 px-3 transition ${unsavedCount > 1 ? 'text-slate-400 hover:bg-slate-900 hover:text-slate-50' : 'cursor-default text-slate-700'}`}
        onClick={onSaveAll}
      >
        <SaveAll size={16} />
        {unsavedCount > 1 && <span className="absolute right-1 top-1 min-w-[14px] rounded-full bg-accent-500 px-1 text-center text-[9px] font-semibold leading-[14px] text-white">{unsavedCount}</span>}
      </button>
      <button
        type="button"
        aria-label={t('AI assistant')}
        aria-pressed={assistantOpen}
        title={assistantOpen ? t('Hide AI assistant') : t('Show AI assistant')}
        className={`${FIXED} -ml-px border-l border-slate-800 bg-slate-950 px-3 transition ${assistantOpen ? 'text-accent-400' : 'text-slate-500 hover:text-slate-50'}`}
        onClick={onToggleAssistant}
      >
        <PanelRight size={17} />
      </button>
    </div>
  )
}
