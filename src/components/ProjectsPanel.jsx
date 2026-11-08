import { useCallback, useContext, useEffect, useState } from 'react'
import { Plus, Settings, X } from 'lucide-react'
import { ContextMenuContext } from './ContextMenu.jsx'
import { ProjectAvatar } from './ProjectIcon.jsx'
import ProjectSettingsDialog from './ProjectSettingsDialog.jsx'
import WorkspaceSelector from './WorkspaceSelector.jsx'
import useWorkspaces from '../hooks/useWorkspaces.js'
import { formatDateTime, t } from '../i18n/index.js'
import { samePath } from '../lib/pathCompare.js'

const electronAPI = window.electronAPI
const revealLabel = /Win/.test(navigator.platform) ? t('Show in File Explorer') : /Mac/.test(navigator.platform) ? t('Reveal in Finder') : t('Show in file manager')

/** Home: elenco dei progetti conosciuti; «Aggiungi progetto» (nel menu «…» del selettore) apre una cartella e, se è nuova, la rende un progetto. */
export default function ProjectsPanel({ project, onMove, onOpen, onOpenFile, onChoose, onSettingsChanged, onListChanged }) {
  const [projects, setProjects] = useState([])
  const [error, setError] = useState('')
  const [settingsFor, setSettingsFor] = useState(null)
  const openMenu = useContext(ContextMenuContext)
  // Lo spazio di lavoro attivo limita l'elenco; dentro uno spazio «Rimuovi» toglie il progetto da lì, non dall'elenco (vale solo con «Tutti»).
  const { activeWorkspace } = useWorkspaces()

  const refresh = useCallback(async () => {
    try { setProjects(await electronAPI.listProjects()) } catch (reason) { setError(reason.message) }
  }, [])

  // Si rilegge anche quando cambia il progetto aperto: l'elenco si riordina per ultimo utilizzo.
  useEffect(() => { refresh() }, [refresh, project])
  // Lo spazio di lavoro (o i suoi membri) è cambiato, anche per mano di un agente: l'elenco si rilegge.
  useEffect(() => electronAPI.onWorkspacesChanged?.(refresh), [refresh])

  async function run(action) {
    setError('')
    try { await action() } catch (reason) { setError(reason.message) }
  }

  // `onListChanged`: l'elenco è cambiato (tolto, spostato, rinominato): la Home, che sta accanto, ricarica il grafo.
  const remove = (item) => run(async () => {
    if (activeWorkspace) { await electronAPI.removeProjectFromWorkspace(activeWorkspace.id, item.path); await refresh() } else setProjects(await electronAPI.removeProject(item.path))
    onListChanged?.()
  })
  // Un progetto aperto da un agente è un membro temporaneo: l'utente lo aggiunge allo spazio o lo ignora.
  const adopt = (item) => run(() => electronAPI.adoptTemporaryProject(item.path))
  const dismiss = (item) => run(() => electronAPI.dismissTemporaryProject(item.path))
  const canRemove = (item) => (activeWorkspace ? !item.temporary : !sameProject(item))
  const removeLabel = activeWorkspace ? t('Remove from workspace') : t('Remove from the list')

  const sameProject = (item) => project && samePath(item.path, project)

  const moveProject = (item) => run(async () => {
    if (await onMove(item.path)) { await refresh(); onListChanged?.() }
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
        (item.temporary || canRemove(item)) && { separator: true },
        item.temporary && { label: t('Add to the workspace'), onClick: () => adopt(item) },
        item.temporary && { label: t('Ignore'), onClick: () => dismiss(item) },
        canRemove(item) && { label: removeLabel, danger: true, onClick: () => remove(item) },
      ].filter(Boolean),
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-2.5 pb-2"><WorkspaceSelector fullWidth onAddProject={() => run(onChoose)} /></div>

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
                  {item.temporary && <span className="rounded border border-dashed border-amber-400/60 px-1.5 text-[10px] uppercase tracking-wide text-amber-300" title={t('Opened by an agent: it is shown here until you add it to the workspace or ignore it.')}>{t('Temporary')}</span>}
                </span>
                <span className="block truncate text-xs text-slate-500">{item.path}</span>
                <span className="block text-xs text-slate-600">{item.missing ? t('Folder not found') : formatDateTime(item.openedAt, { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </span>
            </button>
            <button type="button" disabled={item.missing} aria-label={t('Project settings')} title={t('Project settings')} className="shrink-0 rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30 disabled:hover:bg-transparent" onClick={() => setSettingsFor(item)}><Settings size={14} /></button>
            {item.temporary && (
              <>
                <button type="button" aria-label={t('Add to the workspace')} title={t('Add to the workspace')} className="shrink-0 rounded p-1 text-amber-300 transition hover:bg-slate-800 hover:text-amber-200" onClick={() => adopt(item)}><Plus size={14} /></button>
                <button type="button" aria-label={t('Ignore')} title={t('Ignore')} className="mr-2 shrink-0 rounded p-1 text-slate-500 transition hover:bg-slate-800 hover:text-slate-50" onClick={() => dismiss(item)}><X size={14} /></button>
              </>
            )}
            {!item.temporary && !canRemove(item) && <span className="mr-2 w-[22px] shrink-0" aria-hidden="true" />}
            {!item.temporary && canRemove(item) && (
              <button type="button" aria-label={removeLabel} title={removeLabel} className="mr-2 rounded p-1 text-slate-600 opacity-0 transition hover:bg-slate-800 hover:text-slate-50 focus:opacity-100 group-hover:opacity-100" onClick={() => remove(item)}><X size={14} /></button>
            )}
            </div>
          </li>
        ))}
        {!projects.length && <li className="px-3 py-2 text-xs text-slate-500">{activeWorkspace ? t('This workspace has no projects. Choose “Edit” in the workspace menu above to add some.') : t('No projects yet. Create one or open an existing folder.')}</li>}
      </ul>
      {settingsFor && (
        <ProjectSettingsDialog
          title={settingsFor.name}
          path={settingsFor.path}
          onClose={() => setSettingsFor(null)}
          onMove={onMove ? async (directory) => { const moved = await onMove(directory); if (moved) { setSettingsFor(null); await refresh(); onListChanged?.() } return moved } : undefined} onEditContext={project && samePath(settingsFor.path, project) ? (file) => { setSettingsFor(null); onOpenFile(file) } : undefined} onChanged={() => { refresh(); onListChanged?.(); if (project && samePath(settingsFor.path, project)) onSettingsChanged?.() }}
        />
      )}
    </div>
  )
}
