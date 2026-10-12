import { FileText, PanelRight, Plus, X } from 'lucide-react'

export default function TabBar({ tabs, activeId, onSelect, onClose, onNew, assistantOpen, onToggleAssistant }) {
  return (
    <div role="tablist" aria-label="Documenti aperti" className="flex shrink-0 items-stretch overflow-x-auto border-b border-slate-800 bg-slate-950">
      {tabs.map((tab) => {
        const active = tab.id === activeId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            title={tab.filePath || tab.sourcePath || tab.title}
            className={`group flex max-w-56 shrink-0 cursor-pointer items-center gap-2 border-r border-t-2 border-r-slate-800 px-3 py-2 text-sm transition ${active ? 'border-t-accent-400 bg-slate-900 text-slate-100' : 'border-t-transparent text-slate-500 hover:bg-slate-900/60 hover:text-slate-300'}`}
            onClick={() => onSelect(tab.id)}
            onAuxClick={(event) => { if (event.button === 1) onClose(tab.id) }}
          >
            <FileText size={14} className="shrink-0" />
            <span className="truncate">{tab.title}</span>
            <button
              type="button"
              aria-label={`Chiudi ${tab.title}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-500 hover:bg-slate-700 hover:text-slate-50"
              onClick={(event) => { event.stopPropagation(); onClose(tab.id) }}
            >
              {tab.dirty && <span className="h-2 w-2 rounded-full bg-accent-400 group-hover:hidden" />}
              <X size={13} className={tab.dirty ? 'hidden group-hover:block' : ''} />
            </button>
          </div>
        )
      })}
      <button type="button" aria-label="Nuovo documento" title="Nuovo documento (Ctrl+N)" className="px-3 text-slate-500 transition hover:bg-slate-900 hover:text-slate-50" onClick={onNew}>
        <Plus size={16} />
      </button>
      <button
        type="button"
        aria-label="Assistente AI"
        aria-pressed={assistantOpen}
        title={assistantOpen ? 'Nascondi assistente AI' : 'Mostra assistente AI'}
        className={`sticky right-0 ml-auto shrink-0 border-l border-slate-800 bg-slate-950 px-3 transition ${assistantOpen ? 'text-accent-400' : 'text-slate-500 hover:text-slate-50'}`}
        onClick={onToggleAssistant}
      >
        <PanelRight size={17} />
      </button>
    </div>
  )
}
