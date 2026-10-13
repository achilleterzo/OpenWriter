import { ArrowUpCircle, Brain, FolderKanban, Files, History, ListTree, MessageSquareText, Settings } from 'lucide-react'
import { t } from '../i18n/index.js'

export const sideTabs = [
  { id: 'projects', label: t('Projects'), icon: FolderKanban },
  { id: 'files', label: t('Files'), icon: Files },
  { id: 'outline', label: t('Outline'), icon: ListTree },
  { id: 'notes', label: t('Notes'), icon: MessageSquareText },
  { id: 'history', label: t('History'), icon: History },
  { id: 'memory', label: t('Memory'), icon: Brain },
]

export default function ActivityBar({ activeTab, onSelect, onSettings, update, onUpdate }) {
  const buttonClass = (active) => `flex h-11 w-12 items-center justify-center border-l-2 transition ${active ? 'border-accent-400 text-slate-50' : 'border-transparent text-slate-500 hover:text-slate-200'}`
  return (
    <nav aria-label={t('Side views')} className="flex w-12 shrink-0 flex-col justify-between border-r border-slate-800 bg-slate-950">
      <div role="tablist" aria-orientation="vertical">
        {sideTabs.map(({ id, label, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={activeTab === id} aria-label={label} title={label} className={buttonClass(activeTab === id)} onClick={() => onSelect(id)}>
            <Icon size={20} />
          </button>
        ))}
      </div>
      <div>
        {update && (
          <button type="button" aria-label={t('Update available: v{version}', { version: update.version })} title={t('Update available: v{version}', { version: update.version })} className={`${buttonClass(false)} text-accent-400`} onClick={onUpdate}>
            <ArrowUpCircle size={19} />
          </button>
        )}
      <button type="button" aria-label={t('Settings')} title={t('Settings (Ctrl+,)')} className={buttonClass(false)} onClick={onSettings}>
        <Settings size={19} />
      </button>
      </div>
    </nav>
  )
}
