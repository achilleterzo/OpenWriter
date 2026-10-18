import { useEffect } from 'react'
import { X } from 'lucide-react'
import ProjectSettings from './ProjectSettings.jsx'
import { t } from '../i18n/index.js'

/**
 * Finestra con le impostazioni di un progetto (anche non aperto, o un sotto-progetto). Sta nella finestra: la sua altezza è limitata e le
 * impostazioni scorrono dentro, con l'intestazione sempre visibile; sfondo e bordo sono quelli della finestra, senza un secondo riquadro dentro.
 * Il resto delle proprietà va a `ProjectSettings`.
 */
export default function ProjectSettingsDialog({ title, path, label, onClose, ...settingsProps }) {
  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={label || t('Project settings')} className="flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-xl">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-800 px-5 py-3">
          <span className="min-w-0 truncate text-sm font-semibold text-slate-200" title={path}>{title}</span>
          <button type="button" aria-label={t('Close')} title={t('Close (Esc)')} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProjectSettings project projectPath={path} embedded {...settingsProps} />
        </div>
      </div>
    </div>
  )
}
