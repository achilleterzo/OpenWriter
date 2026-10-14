import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, File, FilePlus, FileText, Folder, FolderInput, FolderOpen, FolderPlus, FolderRoot, Link2, Lock, RefreshCw, Settings, X } from 'lucide-react'

import { ContextMenuContext } from './ContextMenu.jsx'
import ProjectIcon, { ProjectAvatar } from './ProjectIcon.jsx'
import ProjectSettings from './ProjectSettings.jsx'
import { t } from '../i18n/index.js'

const electronAPI = window.electronAPI
const revealLabel = /Win/.test(navigator.platform) ? t('Show in File Explorer') : /Mac/.test(navigator.platform) ? t('Reveal in Finder') : t('Show in file manager')
const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
const parentOf = (target) => target.replace(/[\\/][^\\/]*$/, '')
// Il percorso sta dentro la cartella del progetto (confronto senza distinguere maiuscole e separatori).
const isInsideProject = (target, project) => {
  const normalize = (value) => value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
  return normalize(target).startsWith(`${normalize(project)}/`)
}

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
    const hasOriginals = Boolean(entry.originals?.length)
    return (
      <div>
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
          onClick={() => onOpenFile(entry.path, { preview: true })}
          onDoubleClick={() => onOpenFile(entry.path, { permanent: true })}
          onContextMenu={(event) => menu.open(event, entry)}
          onKeyDown={(event) => menu.key(event, entry)}
        >
          {hasOriginals
            ? (
              <span
                role="button"
                tabIndex={-1}
                aria-label={expanded ? t('Hide the original') : t('Show the original')}
                aria-expanded={expanded}
                title={expanded ? t('Hide the original') : t('Show the original')}
                className="shrink-0 rounded hover:bg-slate-700"
                onClick={(event) => { event.stopPropagation(); onToggle(entry.path) }}
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )
            : <span className="w-3.5 shrink-0" />}
          {/\.(md|markdown|mdown)$/i.test(entry.name)
            ? <FileText size={14} className="shrink-0 text-accent-400" />
            : <File size={14} className="shrink-0 text-slate-500" />}
          {menu.renaming === entry.path ? <RenameInput entry={entry} onCommit={menu.commitRename} onCancel={menu.cancelRename} /> : <span className="truncate">{entry.name}</span>}
        </button>
        {hasOriginals && expanded && entry.originals.map((original) => (
          <button
            key={original.path}
            type="button"
            style={{ paddingLeft: 8 + (depth + 1) * 14 }}
            title={`${original.path} · ${t('Original, read-only')}`}
            className={`${rowClass} ${original.path === activePath ? 'bg-slate-800 text-slate-50' : 'text-slate-500'}`}
            onClick={() => onOpenFile(original.path, { original: true, preview: true })}
            onDoubleClick={() => onOpenFile(original.path, { original: true, permanent: true })}
            onContextMenu={(event) => menu.open(event, { ...original, isDirectory: false })}
            onKeyDown={(event) => menu.key(event, { ...original, isDirectory: false })}
          >
            <span className="w-3.5 shrink-0" />
            <File size={14} className="shrink-0 text-slate-500" />
            <span className="truncate">{original.name}</span>
            <Lock size={11} className="ml-auto shrink-0 text-slate-600" aria-label={t('Original, read-only')} />
          </button>
        ))}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        style={indent}
        aria-expanded={expanded}
        title={entry.isProject ? t('Sub-project') : undefined}
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
          ? <ProjectIcon directory={entry.path} size={14} fallback={<FolderRoot size={14} className="shrink-0 text-amber-400" aria-label={t('Sub-project')} />} />
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

export default function FileExplorer({ project, activePath, refreshToken, expandedPaths, onToggle, onChooseProject, onOpenProject, onOpenFile, onStatus, onRenamed, onDeleted, onSettingsChanged }) {
  const [entries, setEntries] = useState([])
  const [error, setError] = useState('')
  const [localRefresh, setLocalRefresh] = useState(0)
  const token = refreshToken + localRefresh
  const [dropTarget, setDropTarget] = useState(null)
  // Impostazioni di un sotto-progetto (lingua, contesto…): { path, name } della cartella.
  const [subSettings, setSubSettings] = useState(null)

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

  // Sotto-progetto → progetto autonomo: la cartella esce dal progetto (con la sua .ow) nel posto scelto dall'utente.
  async function moveSubprojectOut(entry) {
    try {
      const destination = await electronAPI.moveSubprojectOut(entry.path)
      if (!destination) return
      // Le schede aperte su file della cartella seguono lo spostamento (ora sono fuori dal progetto).
      onRenamed(entry.path, destination)
      setLocalRefresh((value) => value + 1)
      onStatus(t('“{name}” is now a standalone project: {path}', { name: entry.name, path: destination }))
    } catch (reason) {
      onStatus(t('Move failed: {message}', { message: reason.message }))
    }
  }

  // Progetto autonomo → sotto-progetto: sposta qui dentro la cartella di un altro progetto.
  async function moveProjectIn(directory) {
    try {
      const moved = await electronAPI.moveProjectIn(directory)
      if (!moved) return
      if (directory !== project && !expandedPaths.has(directory)) onToggle(directory)
      setLocalRefresh((value) => value + 1)
      onSettingsChanged?.()
      onStatus(t('“{name}” is now a sub-project', { name: moved.split(/[\\/]/).filter(Boolean).at(-1) }))
    } catch (reason) {
      onStatus(t('Move failed: {message}', { message: reason.message }))
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
          entry.isProject && { label: t('Sub-project settings…'), onClick: () => setSubSettings({ path: entry.path, name: entry.name }) },
          entry.isProject && { label: t('Open as project'), onClick: () => onOpenProject(entry.path) },
          entry.isProject && { label: t('Make standalone project…'), onClick: () => moveSubprojectOut(entry) },
          entry.isDirectory && { label: t('Move a project here…'), onClick: () => moveProjectIn(entry.path) },
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

  // Trascinamento dei file. In uscita il file è trascinato dal sistema (si può rilasciare in un'altra applicazione o nel file manager,
  // per allegarlo o copiarlo lì). Lo stesso trascinamento, rilasciato nell'albero, sposta l'elemento se viene dal progetto; i file che
  // arrivano da fuori si copiano nella cartella sotto il puntatore, o nella radice del progetto.
  const drop = {
    target: dropTarget,
    start(event, entry) {
      event.preventDefault()
      electronAPI.startDrag([entry.path])
    },
    end() {
      setDropTarget(null)
    },
    over(event, directory) {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = 'copy'
      setDropTarget(directory)
    },
    async drop(event, directory) {
      if (!hasFiles(event)) return
      event.preventDefault()
      event.stopPropagation()
      setDropTarget(null)
      const paths = electronAPI.getDroppedPaths(Array.from(event.dataTransfer.files))
      if (!paths.length) return
      const folderName = directory === project ? name : directory.split(/[\\/]/).filter(Boolean).at(-1)
      // Tutto ciò che viene dal progetto stesso si sposta (cronologia, note e memoria lo seguono, anche per un sotto-progetto).
      if (paths.every((item) => isInsideProject(item, project))) {
        let moved = 0
        for (const from of paths) {
          if (parentOf(from) === directory || from === directory) continue
          try {
            const destination = await electronAPI.moveIntoDirectory({ from, toDirectory: directory })
            if (destination !== from) { onRenamed(from, destination); moved += 1 }
          } catch (reason) {
            onStatus(t('Move failed: {message}', { message: reason.message }))
          }
        }
        if (moved) {
          if (directory !== project && !expandedPaths.has(directory)) onToggle(directory)
          setLocalRefresh((value) => value + 1)
          onStatus(t('Moved to {folder}', { folder: folderName }))
        }
        return
      }
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

  // Documenti collegati al progetto: stanno altrove e si aprono (e si modificano) lì.
  const [links, setLinks] = useState([])
  useEffect(() => {
    if (!project) { setLinks([]); return }
    electronAPI.listLinks().then(setLinks).catch(() => setLinks([]))
  }, [project, token])
  const removeLink = async (link) => {
    try { setLinks(await electronAPI.removeLink(link.path)) } catch (reason) { setError(reason.message) }
  }
  // Aggiorna il collegamento: si sceglie il file a cui deve puntare (di solito lo stesso, spostato o rinominato).
  const updateLink = async (link) => {
    try {
      const updated = await electronAPI.updateLink(link.path)
      if (updated) { setLinks(updated); onStatus(t('Link updated')) }
    } catch (reason) {
      onStatus(t('Could not update the link: {message}', { message: reason.message }))
    }
  }
  const openLinkMenu = (event, link) => {
    event.preventDefault()
    openMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        !link.missing && { label: t('Open'), onClick: () => onOpenFile(link.path) },
        { label: t('Update link…'), onClick: () => updateLink(link) },
        !link.missing && { label: revealLabel, onClick: () => electronAPI.revealLink(link.path).catch((reason) => onStatus(reason.message)) },
        { separator: true },
        { label: t('Unlink'), danger: true, onClick: () => removeLink(link) },
      ].filter(Boolean),
    })
  }

  useEffect(() => {
    if (!subSettings) return undefined
    const closeOnEscape = (event) => { if (event.key === 'Escape') setSubSettings(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [subSettings])

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
        <button type="button" title={t('{project}\nClick to open the folder in the file manager', { project })} className="min-w-0 flex-1 truncate text-left text-xs font-semibold uppercase tracking-wider text-slate-300 hover:text-slate-50" onClick={() => electronAPI.openProjectFolder().catch((reason) => onStatus(reason.message))}><span className="flex items-center gap-2"><ProjectAvatar directory={project} name={name} active size={28} /><span className="truncate">{name}</span></span></button>
        <button type="button" aria-label={t('New folder…')} title={t('New folder…')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => startCreate(project, 'directory')}><FolderPlus size={14} /></button>
        <button type="button" aria-label={t('New document…')} title={t('New document…')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => startCreate(project, 'file')}><FilePlus size={14} /></button>
        <button type="button" aria-label={t('Move a project here…')} title={t('Move a project here…')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => moveProjectIn(project)}><FolderInput size={14} /></button>
        <button type="button" aria-label={t('Refresh')} title={t('Refresh')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => setLocalRefresh((value) => value + 1)}><RefreshCw size={14} /></button>
        <button type="button" aria-label={t('Project settings')} title={t('Project settings')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => setSubSettings({ path: project, name })}><Settings size={14} /></button>
      </div>
      {creating && (
        <form className="grid gap-1 border-b border-slate-800 px-3 py-2" onSubmit={(event) => { event.preventDefault(); commitCreate() }}>
          <label htmlFor="new-entry-name" className="truncate text-xs text-slate-400">
            {creating.type === 'directory' ? t('New folder in {folder}', { folder: creating.parent === project ? name : creating.parent.split(/[\\/]/).filter(Boolean).at(-1) }) : t('New document in {folder}', { folder: creating.parent === project ? name : creating.parent.split(/[\\/]/).filter(Boolean).at(-1) })}
          </label>
          <input id="new-entry-name" autoFocus value={newName} maxLength={120} className="w-full rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-sm text-slate-100 outline-none focus:border-accent-400" onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setCreating(null) }} />
        </form>
      )}
      {subSettings && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setSubSettings(null) }}>
          <div role="dialog" aria-modal="true" aria-label={subSettings.path === project ? t('Project settings') : t('Sub-project settings')} className="my-4 w-full max-w-2xl rounded-xl bg-slate-900 p-1 shadow-xl">
            <div className="flex items-center justify-between gap-2 px-5 pt-4">
              <span className="min-w-0 truncate text-sm font-semibold text-slate-200" title={subSettings.path}>{subSettings.name}</span>
              <button type="button" aria-label={t('Close')} title={t('Close (Esc)')} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-50" onClick={() => setSubSettings(null)}><X size={16} /></button>
            </div>
            <ProjectSettings project projectPath={subSettings.path} onEditContext={(file) => { setSubSettings(null); onOpenFile(file) }} onChanged={() => onSettingsChanged?.()} />
          </div>
        </div>
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
        {links.length > 0 && (
          <div className="mt-2 border-t border-slate-800 pt-1">
            <h3 className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500" title={t('Documents outside the project folder, linked here: they are opened and edited where they are, not copied.')}><Link2 size={12} /> {t('Linked documents')}</h3>
            {links.map((link) => (
              <div key={link.path} onContextMenu={(event) => openLinkMenu(event, link)} className={`group flex items-center pr-1 text-sm transition hover:bg-slate-800/70 ${link.path === activePath ? 'bg-slate-800 text-slate-50' : link.missing ? 'text-slate-600' : 'text-slate-400'}`}>
                <button type="button" disabled={link.missing} title={link.missing ? `${link.path} · ${t('File not found')}` : link.path} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-3 text-left disabled:cursor-not-allowed" onClick={() => onOpenFile(link.path, { preview: true })} onDoubleClick={() => onOpenFile(link.path, { permanent: true })}>
                  <span className="w-3.5 shrink-0" />
                  <FileText size={14} className={`shrink-0 ${link.missing ? 'text-slate-600' : 'text-accent-400'}`} />
                  <span className={`truncate ${link.missing ? 'line-through' : ''}`}>{link.name}</span>
                </button>
                {link.missing && <button type="button" aria-label={t('Update link…')} title={t('Update link…')} className="rounded p-1 text-amber-500 transition hover:bg-slate-700 hover:text-amber-300" onClick={() => updateLink(link)}><Link2 size={12} /></button>}
                <button type="button" aria-label={t('Unlink')} title={t('Unlink (the file is not touched)')} className="rounded p-1 text-slate-500 opacity-0 transition hover:bg-slate-700 hover:text-slate-50 group-hover:opacity-100 focus:opacity-100" onClick={() => removeLink(link)}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
