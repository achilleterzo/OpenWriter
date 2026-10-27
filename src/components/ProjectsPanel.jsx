import { useCallback, useContext, useEffect, useState } from 'react'
import { FolderOpen, Settings, X } from 'lucide-react'
import { ContextMenuContext } from './ContextMenu.jsx'
import { ProjectAvatar } from './ProjectIcon.jsx'
import ProjectSettingsDialog from './ProjectSettingsDialog.jsx'
import { formatDateTime, t } from '../i18n/index.js'
import { samePath } from '../lib/pathCompare.js'

const electronAPI = window.electronAPI
const revealLabel = /Win/.test(navigator.platform) ? t('Show in File Explorer') : /Mac/.test(navigator.platform) ? t('Reveal in Finder') : t('Show in file manager')

const buttonClass = 'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition'

/** Home: elenco dei progetti conosciuti e apertura di una cartella (se è nuova, diventa un progetto). */
export default function ProjectsPanel({ project, onMove, onOpen, onOpenFile, onChoose, onSettingsChanged }) {
  const [projects, setProjects] = useState([])
  const [error, setError] = useState('')
  const [settingsFor, setSettingsFor] = useState(null)
  const openMenu = useContext(ContextMenuContext)

  const refresh = useCallback(async () => {
    try { setProjects(await electronAPI.listProjects()) } catch (reason) { setError(reason.message) }
  }, [])

  // Si rilegge anche quando cambia il progetto aperto: l'elenco si riordina per ultimo utilizzo.
  useEffect(() => { refresh() }, [refresh, project])

  async function run(action) {
    setError('')
    try { await action() } catch (reason) { setError(reason.message) }
  }

  const remove = (item) => run(async () => setProjects(await electronAPI.removeProject(item.path)))

  const sameProject = (item) => project && samePath(item.path, project)

  const moveProject = (item) => run(async () => {
    if (await onMove(item.path)) await refresh()
  })

  // Menu contestuale di un progetto: aprire, impostazioni, spostare, mostrare nel file manager, togliere dall'elenco.
  function openProjectMenu(event, item) {
    event.preventDefault()
    openMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        !sameProject(item) && !item.missing && { label: t('Open'), onClick: () => run(() => onOpen(item.path)) },
        !item.missing && { label: t('Project settings…'), onClick: () => setSettingsFor(item) },
        { separator: true },
        !item.missing && onMove && { label: t('Move…'), onClick: () => moveProject(item) },
        !item.missing && { label: revealLabel, onClick: () => run(() => electronAPI.revealProject(item.path)) },
        !sameProject(item) && { separator: true },
        !sameProject(item) && { label: t('Remove from the list'), danger: true, onClick: () => remove(item) },
      ].filter(Boolean),
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        <button type="button" className={`${buttonClass} bg-accent-600 text-white hover:bg-accent-500`} onClick={() => run(onChoose)}><FolderOpen size={14} /> {t('Open folder')}</button>
      </div>

      {error && <p className="px-3 pb-2 text-xs text-rose-400">{error}</p>}

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {projects.map((item) => (
          <li key={item.path} className={`border-b border-slate-800/60 ${sameProject(item) ? 'bg-slate-800/60' : ''}`} onContextMenu={(event) => openProjectMenu(event, item)}>
            <div className="group flex items-center">
            <button
              type="button"
              disabled={item.missing}
              title={item.path}
              className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-2.5 pr-1 text-left disabled:opacity-60"
              onClick={() => !sameProject(item) && run(() => onOpen(item.path))}
            >
              <ProjectAvatar directory={item.path} name={item.name} active={sameProject(item)} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 truncate text-sm text-slate-100">
                  {item.name}
                  {sameProject(item) && <span className="rounded bg-accent-500/20 px-1.5 text-[10px] uppercase tracking-wide text-accent-300">{t('Open|project')}</span>}
                </span>
                <span className="block truncate text-xs text-slate-500">{item.path}</span>
                <span className="block text-xs text-slate-600">{item.missing ? t('Folder not found') : formatDateTime(item.openedAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </span>
            </button>
            <button type="button" disabled={item.missing} aria-label={t('Project settings')} title={t('Project settings')} className="shrink-0 rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30 disabled:hover:bg-transparent" onClick={() => setSettingsFor(item)}><Settings size={14} /></button>
            {sameProject(item) && <span className="mr-2 w-[22px] shrink-0" aria-hidden="true" />}
            {!sameProject(item) && (
              <button type="button" aria-label={t('Remove from the list')} title={t('Remove from the list')} className="mr-2 rounded p-1 text-slate-600 opacity-0 transition hover:bg-slate-800 hover:text-slate-50 focus:opacity-100 group-hover:opacity-100" onClick={() => remove(item)}><X size={14} /></button>
            )}
            </div>
          </li>
        ))}
        {!projects.length && <li className="px-3 py-2 text-xs text-slate-500">{t('No projects yet. Create one or open an existing folder.')}</li>}
      </ul>
      {settingsFor && (
        <ProjectSettingsDialog
          title={settingsFor.name}
          path={settingsFor.path}
          onClose={() => setSettingsFor(null)}
          onMove={onMove ? async (directory) => { const moved = await onMove(directory); if (moved) { setSettingsFor(null); await refresh() } return moved } : undefined} onEditContext={project && samePath(settingsFor.path, project) ? (file) => { setSettingsFor(null); onOpenFile(file) } : undefined} onChanged={() => { refresh(); if (project && samePath(settingsFor.path, project)) onSettingsChanged?.() }}
        />
      )}
    </div>
  )
}
