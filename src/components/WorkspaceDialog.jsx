import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { ProjectAvatar } from './ProjectIcon.jsx'
import { useDialogs } from './Dialogs.jsx'
import { samePath } from '../lib/pathCompare.js'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI

function Switch({ on, label, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`relative h-5 w-9 shrink-0 rounded-full transition ${on ? 'bg-accent-600' : 'bg-slate-700'}`}
      onClick={onChange}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

/**
 * Crea o modifica uno spazio di lavoro: un nome e, per ogni progetto dell'elenco, un interruttore che lo aggiunge o lo toglie.
 * `workspace` null = nuovo (i cambi si applicano con «Crea», e lo spazio nuovo diventa quello attivo); altrimenti si modifica quello dato, e ogni cambio vale subito.
 */
export default function WorkspaceDialog({ workspace = null, onClose }) {
  const dialogs = useDialogs()
  const editing = Boolean(workspace)
  const [name, setName] = useState(workspace?.name || '')
  const [selected, setSelectedState] = useState(workspace?.projects || [])
  // Il valore corrente sta anche in un riferimento: due clic ravvicinati partono dallo stato aggiornato, non da quello dell'ultimo disegno.
  const selectedRef = useRef(selected)
  const setSelected = (next) => { selectedRef.current = next; setSelectedState(next) }
  const [projects, setProjects] = useState(null)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    electronAPI.listAllProjects().then(setProjects).catch((reason) => setError(reason.message))
  }, [])

  useEffect(() => {
    const onKeyDown = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [onClose])

  const has = (path) => selected.some((item) => samePath(item, path))
  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return (projects || []).filter((item) => !needle || item.name.toLowerCase().includes(needle) || item.path.toLowerCase().includes(needle))
  }, [projects, filter])

  async function toggle(item) {
    const before = selectedRef.current
    const was = before.some((known) => samePath(known, item.path))
    setSelected(was ? before.filter((known) => !samePath(known, item.path)) : [...before, item.path])
    if (!editing) return
    // Modificando, ogni cambio vale subito: se non riesce, l'interruttore torna com'era.
    try { await (was ? electronAPI.removeProjectFromWorkspace(workspace.id, item.path) : electronAPI.addProjectToWorkspace(workspace.id, item.path)) } catch (reason) { setError(reason.message); setSelected(before) }
  }

  async function commitName() {
    if (editing && name.trim() && name.trim() !== workspace.name) {
      try { await electronAPI.renameWorkspace(workspace.id, name) } catch (reason) { setError(reason.message) }
    }
  }

  async function create() {
    try {
      const made = await electronAPI.createWorkspace({ name, projects: selected })
      await electronAPI.setActiveWorkspace(made.id)
      onClose()
    } catch (reason) { setError(reason.message) }
  }

  async function remove() {
    const confirmed = await dialogs.confirm(t('Delete the workspace “{name}”?', { name: workspace.name }), {
      detail: t('The projects are not deleted: they stay in the list and in All projects.'),
      confirmLabel: t('Delete'),
      danger: true,
    })
    if (!confirmed) return
    try { await electronAPI.removeWorkspace(workspace.id); onClose() } catch (reason) { setError(reason.message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label={editing ? t('Edit workspace') : t('New workspace')}
        className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 rounded-xl border border-slate-700 bg-slate-900 p-4 text-sm text-slate-200 shadow-xl"
        onSubmit={(event) => { event.preventDefault(); if (editing) onClose(); else create() }}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-100">{editing ? t('Edit workspace') : t('New workspace')}</h2>
          <button type="button" aria-label={t('Close')} className="rounded p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50" onClick={onClose}><X size={16} /></button>
        </div>
        <input
          autoFocus
          value={name}
          maxLength={60}
          aria-label={t('Workspace name')}
          placeholder={t('Workspace name')}
          className="w-full rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400"
          onChange={(event) => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={(event) => { if (event.key === 'Enter' && editing) { event.preventDefault(); commitName().then(() => event.target.blur()) } }}
        />
        <div className="flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>{t('Projects in this workspace')}</span>
          <span className="tabular-nums">{selected.length}</span>
        </div>
        {projects && projects.length > 6 && (
          <label className="flex items-center gap-2 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1.5 focus-within:border-accent-400">
            <Search size={14} className="shrink-0 text-slate-500" />
            <input value={filter} aria-label={t('Filter projects')} placeholder={t('Filter projects')} className="min-w-0 flex-1 bg-transparent text-slate-100 outline-none placeholder:text-slate-500" onChange={(event) => setFilter(event.target.value)} />
          </label>
        )}
        <ul className="min-h-0 flex-1 overflow-y-auto rounded-md border border-slate-800">
          {shown.map((item) => (
            <li key={item.path} className="flex items-center gap-2.5 border-b border-slate-800/60 px-2.5 py-2 last:border-b-0">
              <ProjectAvatar directory={item.path} name={item.name} />
              <span className="min-w-0 flex-1">
                <span className={`block truncate ${item.missing ? 'text-slate-500' : 'text-slate-100'}`}>{item.name}</span>
                <span className="block truncate text-xs text-slate-500">{item.missing ? t('Folder not found') : item.path}</span>
              </span>
              <Switch on={has(item.path)} label={t('In the workspace: {name}', { name: item.name })} onChange={() => toggle(item)} />
            </li>
          ))}
          {projects && !shown.length && <li className="px-3 py-3 text-xs text-slate-500">{projects.length ? t('No results') : t('No projects yet. Create one or open an existing folder.')}</li>}
        </ul>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <div className="flex items-center justify-between gap-2">
          {editing ? <button type="button" className="rounded-md px-3 py-1.5 text-rose-300 transition hover:bg-rose-500/15" onClick={remove}>{t('Delete workspace')}</button> : <span />}
          <div className="flex gap-2">
            {!editing && <button type="button" className="rounded-md px-3 py-1.5 text-slate-300 transition hover:bg-slate-800" onClick={onClose}>{t('Cancel')}</button>}
            <button type="submit" className="rounded-md bg-accent-600 px-3 py-1.5 font-medium text-white transition hover:bg-accent-500">{editing ? t('Close') : t('Create')}</button>
          </div>
        </div>
      </form>
    </div>
  )
}
