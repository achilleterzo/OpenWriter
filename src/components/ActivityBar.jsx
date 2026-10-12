import { Files, History, ListTree, Settings } from 'lucide-react'

export const sideTabs = [
  { id: 'files', label: 'File', icon: Files },
  { id: 'outline', label: 'Struttura', icon: ListTree },
  { id: 'history', label: 'Cronologia', icon: History },
]

export default function ActivityBar({ activeTab, onSelect, onSettings }) {
  const buttonClass = (active) => `flex h-11 w-12 items-center justify-center border-l-2 transition ${active ? 'border-accent-400 text-slate-50' : 'border-transparent text-slate-500 hover:text-slate-200'}`
  return (
    <nav aria-label="Viste laterali" className="flex w-12 shrink-0 flex-col justify-between border-r border-slate-800 bg-slate-950">
      <div role="tablist" aria-orientation="vertical">
        {sideTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={activeTab === id} aria-label={label} title={label} className={buttonClass(activeTab === id)} onClick={() => onSelect(id)}>
            <Icon size={20} />
          </button>
        ))}
      </div>
      <button type="button" aria-label="Impostazioni" title="Impostazioni (Ctrl+,)" className={buttonClass(false)} onClick={onSettings}>
        <Settings size={19} />
      </button>
    </nav>
  )
}
