import { useContext, useRef, useState } from 'react'
import { FileText, Globe, PanelRight, Pin, Plus, X } from 'lucide-react'
import { ContextMenuContext } from './ContextMenu.jsx'
import { t } from '../i18n/index.js'

export default function TabBar({ tabs, activeId, onSelect, onClose, onTogglePin, onMove, onNew, onNewBrowser, assistantOpen, onToggleAssistant }) {
  const openMenu = useContext(ContextMenuContext)
  const dragging = useRef(null)
  const [dropTarget, setDropTarget] = useState(null)

  return (
    <div role="tablist" aria-label={t('Open documents')} className="flex shrink-0 items-stretch overflow-x-auto border-b border-slate-800 bg-slate-950">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={tab.filePath || tab.sourcePath || tab.title}
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
                tab.kind !== 'browser' && { label: tab.pinned ? t('Unpin tab') : t('Pin tab'), onClick: () => onTogglePin(tab.id) },
                { label: t('Close'), onClick: () => onClose(tab.id) },
              ].filter(Boolean) })
            }}
            onClick={() => onSelect(tab.id)}
            onAuxClick={(event) => { if (event.button === 1) onClose(tab.id) }}
          >
            {tab.kind === 'browser' ? <Globe size={14} className="shrink-0" /> : <FileText size={14} className="shrink-0" />}
            <span className={`truncate ${tab.closed ? 'italic opacity-60' : ''}`}>{tab.title}</span>
            {tab.kind !== 'browser' && (
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
      <button type="button" aria-label={t('New document')} title={t('New document (Ctrl+N)')} className="px-3 text-slate-500 transition hover:bg-slate-900 hover:text-slate-50" onClick={onNew}>
        <Plus size={16} />
      </button>
      <button type="button" aria-label={t('Open the browser')} title={t('New browser tab')} className="px-3 text-slate-500 transition hover:bg-slate-900 hover:text-slate-50" onClick={onNewBrowser}>
        <Globe size={16} />
      </button>
      <button
        type="button"
        aria-label={t('AI assistant')}
        aria-pressed={assistantOpen}
        title={assistantOpen ? t('Hide AI assistant') : t('Show AI assistant')}
        className={`sticky right-0 ml-auto shrink-0 border-l border-slate-800 bg-slate-950 px-3 transition ${assistantOpen ? 'text-accent-400' : 'text-slate-500 hover:text-slate-50'}`}
        onClick={onToggleAssistant}
      >
        <PanelRight size={17} />
      </button>
    </div>
  )
}
