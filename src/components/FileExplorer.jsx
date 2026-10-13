import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, File, FilePlus, FileText, Folder, FolderOpen, FolderPlus, FolderRoot, RefreshCw } from 'lucide-react'

import { ContextMenuContext } from './ContextMenu.jsx'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const revealLabel = /Win/.test(navigator.platform) ? t('Show in File Explorer') : /Mac/.test(navigator.platform) ? t('Reveal in Finder') : t('Show in file manager')
const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
// Trascinamento interno: un elemento dell'albero spostato in un'altra cartella.
const INTERNAL_DRAG = 'application/x-openwriter-path'
const parentOf = (target) => target.replace(/[\\/][^\\/]*$/, '')
const hasInternal = (event) => Array.from(event.dataTransfer?.types || []).includes(INTERNAL_DRAG)

// Campo di rinomina in linea: Invio conferma, Esc annulla, la perdita del focus conferma. Seleziona il nome senza estensione.
function RenameInput({ entry, onCommit, onCancel }) {
  const inputRef = useRef(null)
  const finished = useRef(false)

  useEffect(() => {
    const input = inputRef.current
    input.focus()
    const dot = entry.isDirectory ? -1 : entry.name.lastIndexOf('.')
    input.setSelectionRange(0, dot > 0 ? dot : entry.name.length)
  }, [entry])

  const finish = (commit) => {
    if (finished.current) return
    finished.current = true
    if (commit) onCommit(entry, inputRef.current.value)
    else onCancel()
  }

  return (
    <input
      ref={inputRef}
      defaultValue={entry.name}
      aria-label={t('New name')}
      className="min-w-0 flex-1 rounded border border-accent-400 bg-slate-800 px-1.5 py-0.5 text-sm text-slate-50 outline-none"
      onClick={(event) => event.stopPropagation()}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') finish(true)
        if (event.key === 'Escape') finish(false)
      }}
    />
  )
}

function TreeNode({ entry, depth, activePath, refreshToken, expandedPaths, onToggle, onOpenFile, drop, menu }) {
  const expanded = expandedPaths.has(entry.path)
  const [children, setChildren] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setChildren(await electronAPI.listDirectory(entry.path))
      setError('')
    } catch (reason) {
      setError(reason.message)
    }
  }, [entry.path])

  useEffect(() => {
    if (expanded) load()
  }, [expanded, refreshToken, load])

  const indent = { paddingLeft: 8 + depth * 14 }
  const rowClass = 'flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm transition hover:bg-slate-800/70'

  if (!entry.isDirectory) {
    const active = entry.path === activePath
    return (
      <button
        type="button"
        style={indent}
        title={entry.path}
        draggable={menu.renaming !== entry.path}
        onDragStart={(event) => drop.start(event, entry)}
        onDragEnd={drop.end}
        onDragOver={(event) => drop.over(event, parentOf(entry.path))}
        onDrop={(event) => drop.drop(event, parentOf(entry.path))}
        className={`${rowClass} ${active ? 'bg-slate-800 text-slate-50' : 'text-slate-400'}`}
        onClick={() => onOpenFile(entry.path)}
        onContextMenu={(event) => menu.open(event, entry)}
        onKeyDown={(event) => menu.key(event, entry)}
      >
        <span className="w-3.5 shrink-0" />
        {/\.(md|markdown|mdown)$/i.test(entry.name)
          ? <FileText size={14} className="shrink-0 text-accent-400" />
          : <File size={14} className="shrink-0 text-slate-500" />}
        {menu.renaming === entry.path ? <RenameInput entry={entry} onCommit={menu.commitRename} onCancel={menu.cancelRename} /> : <span className="truncate">{entry.name}</span>}
      </button>
    )
  }

  return (
    <div>
      <button
        type="button"
        style={indent}
        aria-expanded={expanded}
        title={entry.isProject ? t('Sub-project: it has its own .ow folder') : undefined}
        draggable={menu.renaming !== entry.path}
        onDragStart={(event) => drop.start(event, entry)}
        onDragEnd={drop.end}
        className={`${rowClass} text-slate-300 ${drop.target === entry.path ? 'bg-accent-500/20 ring-1 ring-inset ring-accent-400' : ''}`}
        onClick={() => onToggle(entry.path)}
        onContextMenu={(event) => menu.open(event, entry)}
        onKeyDown={(event) => menu.key(event, entry)}
        onDragOver={(event) => drop.over(event, entry.path)}
        onDrop={(event) => drop.drop(event, entry.path)}
      >
        {expanded ? <ChevronDown size={14} className="shrink-0" /> : <ChevronRight size={14} className="shrink-0" />}
        {entry.isProject
          ? <FolderRoot size={14} className="shrink-0 text-amber-400" aria-label={t('Sub-project')} />
          : expanded ? <FolderOpen size={14} className="shrink-0 text-accent-400" /> : <Folder size={14} className="shrink-0 text-accent-400" />}
        {menu.renaming === entry.path ? <RenameInput entry={entry} onCommit={menu.commitRename} onCancel={menu.cancelRename} /> : <span className="truncate">{entry.name}</span>}
      </button>
      {expanded && error && <p style={indent} className="py-1 text-xs text-rose-400">{error}</p>}
      {expanded && children?.length === 0 && <p style={{ paddingLeft: 8 + (depth + 1) * 14 + 20 }} className="py-1 text-xs text-slate-500">{t('Empty')}</p>}
      {expanded && children?.map((child) => (
        <TreeNode key={child.path} entry={child} depth={depth + 1} activePath={activePath} refreshToken={refreshToken} expandedPaths={expandedPaths} onToggle={onToggle} onOpenFile={onOpenFile} drop={drop} menu={menu} />
      ))}
    </div>
  )
}

export default function FileExplorer({ project, activePath, refreshToken, expandedPaths, onToggle, onChooseProject, onOpenProject, onOpenFile, onStatus, onRenamed, onDeleted }) {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [localRefresh, setLocalRefresh] = useState(0)
  const token = refreshToken + localRefresh
  const [dropTarget, setDropTarget] = useState(null)
  // Elemento che si sta trascinando (il contenuto del trascinamento non è leggibile finché non si rilascia).
  const dragged = useRef(null)

  const [renaming, setRenaming] = useState(null)
  // Nuova cartella o nuovo documento: { parent, type: 'directory' | 'file' } con il nome in corso di digitazione.
  const [creating, setCreating] = useState(null)
  const [newName, setNewName] = useState('')
  const openMenu = useContext(ContextMenuContext)

  const deleteEntry = async (entry) => {
    try {
      if (await electronAPI.deletePath(entry.path)) {
        onDeleted(entry.path)
        setLocalRefresh((value) => value + 1)
      }
    } catch (reason) {
      onStatus(t('Delete failed: {message}', { message: reason.message }))
    }
  }

  async function createSubproject(entry) {
    try {
      await electronAPI.createSubproject(entry.path)
      setLocalRefresh((value) => value + 1)
      onStatus(t('“{name}” is now a sub-project', { name: entry.name }))
    } catch (reason) {
      onStatus(t('Could not create: {message}', { message: reason.message }))
    }
  }

  function startCreate(parent, type) {
    setCreating({ parent, type })
    setNewName('')
  }

  async function commitCreate() {
    const name = newName.trim()
    if (!name || !creating) return
    const { parent, type } = creating
    try {
      const created = await electronAPI.createEntry({ parent, name, type })
      setCreating(null)
      if (parent !== project && !expandedPaths.has(parent)) onToggle(parent)
      setLocalRefresh((value) => value + 1)
      if (type === 'file') onOpenFile(created)
    } catch (reason) {
      onStatus(t('Could not create: {message}', { message: reason.message }))
    }
  }

  // Menu contestuale (Apri, Rinomina, Elimina, Mostra nel file manager) e scorciatoie F2 / Canc.
  const menu = {
    renaming,
    open(event, entry) {
      event.preventDefault()
      event.stopPropagation()
      openMenu({
        x: event.clientX,
        y: event.clientY,
        items: [
          !entry.isDirectory && { label: t('Open'), onClick: () => onOpenFile(entry.path) },
          entry.isDirectory && { label: t('New folder…'), onClick: () => startCreate(entry.path, 'directory') },
          entry.isDirectory && { label: t('New document…'), onClick: () => startCreate(entry.path, 'file') },
          entry.isDirectory && { separator: true },
          entry.isDirectory && !entry.isProject && { label: t('Create sub-project…'), onClick: () => createSubproject(entry) },
          entry.isProject && { label: t('Open as project'), onClick: () => onOpenProject(entry.path) },
          entry.isDirectory && { separator: true },
          { label: t('Rename'), hint: 'F2', onClick: () => setRenaming(entry.path) },
          { label: t('Delete'), hint: t('Del'), danger: true, onClick: () => deleteEntry(entry) },
          { separator: true },
          { label: revealLabel, onClick: () => electronAPI.revealPath(entry.path) },
        ].filter(Boolean),
      })
    },
    key(event, entry) {
      if (renaming) return
      if (event.key === 'F2') { event.preventDefault(); setRenaming(entry.path) }
      if (event.key === 'Delete') { event.preventDefault(); deleteEntry(entry) }
    },
    cancelRename: () => setRenaming(null),
    async commitRename(entry, newName) {
      setRenaming(null)
      const name = newName.trim()
      if (!name || name === entry.name) return
      try {
        const destination = await electronAPI.renamePath({ path: entry.path, newName: name })
        onRenamed(entry.path, destination)
        setLocalRefresh((value) => value + 1)
      } catch (reason) {
        onStatus(t('Rename failed: {message}', { message: reason.message }))
      }
    },
  }

  // Trascinando file dal sistema si copiano nella cartella sotto il puntatore, o nella radice del progetto.
  const drop = {
    target: dropTarget,
    start(event, entry) {
      dragged.current = entry.path
      event.dataTransfer.setData(INTERNAL_DRAG, entry.path)
      event.dataTransfer.effectAllowed = 'copyMove'
    },
    end() {
      dragged.current = null
      setDropTarget(null)
    },
    // Rilasciare un elemento nella cartella in cui già sta (o su sé stesso) non sposta nulla: il rilascio non è nemmeno consentito.
    isNoop: (event, directory) => hasInternal(event) && dragged.current !== null && (parentOf(dragged.current) === directory || dragged.current === directory),
    over(event, directory) {
      if (!hasFiles(event) && !hasInternal(event)) return
      if (drop.isNoop(event, directory)) {
        event.stopPropagation()
        event.dataTransfer.dropEffect = 'none'
        setDropTarget(null)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = hasInternal(event) ? 'move' : 'copy'
      setDropTarget(directory)
    },
    async drop(event, directory) {
      if (!hasFiles(event) && !hasInternal(event)) return
      event.preventDefault()
      event.stopPropagation()
      setDropTarget(null)
      if (drop.isNoop(event, directory)) { dragged.current = null; return }
      if (hasInternal(event)) {
        // Cronologia, note e memoria dell'elemento lo seguono, anche se la cartella è un sotto-progetto.
        const from = event.dataTransfer.getData(INTERNAL_DRAG)
        try {
          const destination = await electronAPI.moveIntoDirectory({ from, toDirectory: directory })
          if (destination !== from) {
            onRenamed(from, destination)
            if (directory !== project && !expandedPaths.has(directory)) onToggle(directory)
            setLocalRefresh((value) => value + 1)
            onStatus(t('Moved to {folder}', { folder: directory === project ? name : directory.split(/[\\/]/).filter(Boolean).at(-1) }))
          }
        } catch (reason) {
          onStatus(t('Move failed: {message}', { message: reason.message }))
        }
        return
      }
      const paths = electronAPI.getDroppedPaths(Array.from(event.dataTransfer.files))
      try {
        const result = await electronAPI.importFiles({ paths, targetDirectory: directory })
        if (directory !== project && !expandedPaths.has(directory)) onToggle(directory)
        setLocalRefresh((value) => value + 1)
        onStatus(result.skipped.length
          ? t('{copied} copied, {skipped} skipped (unsupported format)', { copied: result.copied.length, skipped: result.skipped.length })
          : t('{copied} copied', { copied: result.copied.length }))
      } catch (reason) {
        onStatus(t('Copy failed: {message}', { message: reason.message }))
      }
    },
  }

  useEffect(() => {
    if (!project) { setEntries([]); return }
    electronAPI.listDirectory(project).then((list) => { setEntries(list); setError('') }).catch((reason) => setError(reason.message))
  }, [project, token])

  if (!project) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
        <FolderOpen size={32} className="text-slate-500" />
        <p className="text-sm text-slate-400">{t('No project is open. The project folder is the working directory.')}</p>
        <button type="button" className="rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500" onClick={onChooseProject}>{t('Open folder')}</button>
      </div>
    )
  }

  const name = project.split(/[\\/]/).filter(Boolean).at(-1) || project

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-slate-800 px-3 py-2">
        <button type="button" title={t('{project}\nClick to open the folder in the file manager', { project })} className="min-w-0 flex-1 truncate text-left text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-slate-50" onClick={() => electronAPI.openProjectFolder().catch((reason) => onStatus(reason.message))}>{name}</button>
        <button type="button" aria-label={t('New folder…')} title={t('New folder…')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => startCreate(project, 'directory')}><FolderPlus size={14} /></button>
        <button type="button" aria-label={t('New document…')} title={t('New document…')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => startCreate(project, 'file')}><FilePlus size={14} /></button>
        <button type="button" aria-label={t('Refresh')} title={t('Refresh')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => setLocalRefresh((value) => value + 1)}><RefreshCw size={14} /></button>
      </div>
      {creating && (
        <form className="grid gap-1 border-b border-slate-800 px-3 py-2" onSubmit={(event) => { event.preventDefault(); commitCreate() }}>
          <label htmlFor="new-entry-name" className="truncate text-xs text-slate-400">
            {creating.type === 'directory' ? t('New folder in {folder}', { folder: creating.parent === project ? name : creating.parent.split(/[\\/]/).filter(Boolean).at(-1) }) : t('New document in {folder}', { folder: creating.parent === project ? name : creating.parent.split(/[\\/]/).filter(Boolean).at(-1) })}
          </label>
          <input id="new-entry-name" autoFocus value={newName} maxLength={120} className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent-400" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setCreating(null) }} />
        </form>
      )}
      <div
        className={`min-h-0 flex-1 overflow-y-auto py-1 ${dropTarget === project ? 'bg-accent-500/10 ring-1 ring-inset ring-accent-400' : ''}`}
        onDragOver={(event) => drop.over(event, project)}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null) }}
        onDrop={(event) => drop.drop(event, project)}
      >
        {error && <p className="px-3 py-2 text-xs text-rose-400">{error}</p>}
        {!error && entries.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">{t('No documents (.md, .docx, .pdf) in this folder. Drop files here to copy them.')}</p>}
        {entries.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} activePath={activePath} refreshToken={token} expandedPaths={expandedPaths} onToggle={onToggle} onOpenFile={onOpenFile} drop={drop} menu={menu} />
        ))}
      </div>
    </div>
  )
}
