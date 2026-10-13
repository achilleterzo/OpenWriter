import { useCallback, useEffect, useState } from 'react'
import { FolderOpen, FolderPlus, Settings, X } from 'lucide-react'
import ProjectSettings from './ProjectSettings.jsx'
import { formatDateTime, t } from '../i18n/index.js'

const electronAPI = window.electronAPI

const fieldClass = 'w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-accent-400'
const buttonClass = 'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition'

/** Home: elenco dei progetti conosciuti, apertura di una cartella esistente e creazione di un nuovo progetto. */
const languages = ['Italiano', 'English', 'Español', 'Français', 'Deutsch', 'Português']

// Cambia la lingua dei documenti del progetto aperto, lasciando intatte le altre impostazioni.
async function saveDocumentLanguage(documentLanguage) {
  const current = await electronAPI.getProjectSettings()
  await electronAPI.saveProjectSettings({ name: current.name, ai: { context: current.ai.context, language: current.ai.language, documentLanguage }, options: current.options, spellcheck: current.spellcheck })
}

function LanguageSelect({ id, value, onChange }) {
  return (
    <select id={id} value={value} className={fieldClass} onChange={(event) => onChange(event.target.value)}>
      <option value="">{t('Same as the reply language')}</option>
      {[...new Set([...languages, value].filter(Boolean))].map((language) => <option key={language} value={language}>{language}</option>)}
    </select>
  )
}

export default function ProjectsPanel({ project, onOpen, onOpenFile, onChoose, onCreate, onSettingsChanged }) {
  const [projects, setProjects] = useState([])
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [newLanguage, setNewLanguage] = useState('')
  const [settingsFor, setSettingsFor] = useState(null)

  const refresh = useCallback(async () => {
    try { setProjects(await electronAPI.listProjects()) } catch (reason) { setError(reason.message) }
  }, [])

  // Si rilegge anche quando cambia il progetto aperto: l'elenco si riordina per ultimo utilizzo.
  useEffect(() => { refresh() }, [refresh, project])

  async function run(action) {
    setError('')
    try { await action() } catch (reason) { setError(reason.message) }
  }

  const create = () => run(async () => {
    const created = await onCreate(name.trim())
    if (created) {
      if (newLanguage) { await saveDocumentLanguage(newLanguage); onSettingsChanged?.() }
      setCreating(false)
      setName('')
    }
  })

  const remove = (item) => run(async () => setProjects(await electronAPI.removeProject(item.path)))

  const sameProject = (item) => project && item.path.toLowerCase() === project.toLowerCase()

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        <button type="button" className={`${buttonClass} bg-accent-600 text-white hover:bg-accent-500`} onClick={() => { setCreating(true); setError('') }}><FolderPlus size={14} /> {t('New project…')}</button>
        <button type="button" className={`${buttonClass} bg-slate-800 text-slate-200 hover:bg-slate-700`} onClick={() => run(onChoose)}><FolderOpen size={14} /> {t('Open folder')}</button>
      </div>

      {creating && (
        <form className="grid gap-1.5 px-3 pb-3" onSubmit={(event) => { event.preventDefault(); if (name.trim()) create() }}>
          <label className="text-xs text-slate-400" htmlFor="new-project-name">{t('Project name')}</label>
          <input id="new-project-name" autoFocus value={name} maxLength={120} className={fieldClass} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setCreating(false) }} />
          <label className="text-xs text-slate-400" htmlFor="new-project-language">{t('Language of the documents in this project')}</label>
          <LanguageSelect id="new-project-language" value={newLanguage} onChange={setNewLanguage} />
          <p className="text-xs text-slate-500">{t('You will choose where to create the folder.')}</p>
          <div className="flex gap-1.5">
            <button type="submit" disabled={!name.trim()} className={`${buttonClass} bg-accent-600 text-white hover:bg-accent-500 disabled:opacity-50`}>{t('Create')}</button>
            <button type="button" className={`${buttonClass} text-slate-400 hover:bg-slate-800 hover:text-slate-50`} onClick={() => setCreating(false)}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      {error && <p className="px-3 pb-2 text-xs text-rose-400">{error}</p>}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {projects.map((item) => (
          <li key={item.path} className={`border-b border-slate-800/60 ${sameProject(item) ? 'bg-slate-800/60' : ''}`}>
            <div className="group flex items-center">
            <button type="button" disabled={item.missing} aria-label={t('Project settings')} title={t('Project settings')} className="ml-2 shrink-0 rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30 disabled:hover:bg-transparent" onClick={() => setSettingsFor(item)}><Settings size={14} /></button>
            <button
              type="button"
              disabled={item.missing}
              title={item.path}
              className="min-w-0 flex-1 px-2 py-2 text-left disabled:opacity-60"
              onClick={() => !sameProject(item) && run(() => onOpen(item.path))}
            >
              <span className="flex items-center gap-1.5 truncate text-sm text-slate-100">
                {item.name}
                {sameProject(item) && <span className="rounded bg-accent-500/20 px-1.5 text-[10px] uppercase tracking-wide text-accent-300">{t('Open|project')}</span>}
              </span>
              <span className="block truncate text-xs text-slate-500">{item.path}</span>
              <span className="block text-xs text-slate-600">{item.missing ? t('Folder not found') : formatDateTime(item.openedAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </button>
            {!sameProject(item) && (
              <button type="button" aria-label={t('Remove from the list')} title={t('Remove from the list')} className="mr-2 rounded p-1 text-slate-600 opacity-0 transition hover:bg-slate-800 hover:text-slate-50 focus:opacity-100 group-hover:opacity-100" onClick={() => remove(item)}><X size={14} /></button>
            )}
            </div>
          </li>
        ))}
        {!projects.length && <li className="px-3 py-2 text-xs text-slate-500">{t('No projects yet. Create one or open an existing folder.')}</li>}
      </ul>
      {settingsFor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsFor(null) }}>
          <div role="dialog" aria-modal="true" aria-label={t('Project settings')} className="my-4 w-full max-w-2xl rounded-xl bg-slate-900 p-1 shadow-xl">
            <div className="flex items-center justify-between gap-2 px-5 pt-4">
              <span className="min-w-0 truncate text-sm font-semibold text-slate-200" title={settingsFor.path}>{settingsFor.name}</span>
              <button type="button" aria-label={t('Close')} title={t('Close (Esc)')} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={() => setSettingsFor(null)}><X size={16} /></button>
            </div>
            <ProjectSettings project projectPath={settingsFor.path} onEditContext={project && settingsFor.path.toLowerCase() === project.toLowerCase() ? (file) => { setSettingsFor(null); onOpenFile(file) } : undefined} onChanged={() => { refresh(); if (project && settingsFor.path.toLowerCase() === project.toLowerCase()) onSettingsChanged?.() }} />
          </div>
        </div>
      )}
    </div>
  )
}
