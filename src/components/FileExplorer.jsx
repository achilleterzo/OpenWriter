import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, File, FilePlus, FileText, Folder, FolderInput, FolderOpen, FolderPlus, FolderRoot, Image as ImageIcon, Library, Link2, Lock, RefreshCw, Settings, X } from 'lucide-react'

import { ContextMenuContext } from './ContextMenu.jsx'
import ProjectIcon, { ProjectAvatar } from './ProjectIcon.jsx'
import { isImageFile } from '../lib/imagePaths.js'
import ProjectSettingsDialog from './ProjectSettingsDialog.jsx'
import { t } from '../i18n/index.js'
import { isInsidePath, samePath } from '../lib/pathCompare.js'

const electronAPI = window.electronAPI
const revealLabel = /Win/.test(navigator.platform) ? t('Show in File Explorer') : /Mac/.test(navigator.platform) ? t('Reveal in Finder') : t('Show in file manager')
const hasFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files')
const parentOf = (target) => target.replace(/[\\/][^\\/]*$/, '')
// Il percorso sta dentro la cartella del progetto (maiuscole e separatori come in pathCompare.js).
const isInsideProject = (target, project) => isInsidePath(target.replace(/\/+$/, ''), project.replace(/\/+$/, ''))

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

  const finish = (commit, keepFocus = false) => {
    if (finished.current) return
    finished.current = true
    if (commit) onCommit(entry, inputRef.current.value, { keepFocus })
    else onCancel(entry, { keepFocus })
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
        if (event.key === 'Enter') { event.preventDefault(); finish(true, true) }
        if (event.key === 'Escape') { event.preventDefault(); finish(false, true) }
      }}
    />
  )
}

// Riga di creazione in linea: compare nell'albero, dentro la cartella in cui si sta creando, al posto in cui comparirà il nuovo elemento.
// Invio conferma, Esc annulla; perdendo il focus (clic altrove) si annulla, salvo che sia la finestra a perderlo.
function CreateRow({ depth, menu }) {
  const ref = useRef(null)
  const directory = menu.creating.type === 'directory'

  useEffect(() => {
    ref.current?.focus()
    ref.current?.scrollIntoView({ block: 'nearest' })
  }, [])

  return (
    <div style={{ paddingLeft: 8 + depth * 14 }} className="flex items-center gap-1.5 py-0.5 pr-2">
      <span className="w-3.5 shrink-0" />
      {directory ? <Folder size={14} className="shrink-0 text-accent-400" /> : <FileText size={14} className="shrink-0 text-accent-400" />}
      <input
        ref={ref}
        value={menu.newName}
        maxLength={120}
        aria-label={directory ? t('Folder name') : t('Document name')}
        placeholder={directory ? t('Folder name') : t('Document name')}
        className="min-w-0 flex-1 rounded border border-accent-400 bg-slate-800 px-1.5 py-0.5 text-sm text-slate-100 outline-none placeholder:text-slate-500"
        onChange={(event) => menu.setNewName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); menu.commitCreate() }
          if (event.key === 'Escape') { event.preventDefault(); menu.cancelCreate() }
        }}
        onBlur={() => { if (document.hasFocus()) menu.cancelCreate() }}
      />
    </div>
  )
}

// Frecce nell'albero (come in un file manager): su/giù tra le righe visibili, Home/Fine agli estremi; destra apre una cartella (o scende nel suo contenuto),
// sinistra la chiude (o torna alla cartella che contiene la riga). Invio apre il file: è già il clic del pulsante.
function navigateTree(event, onMoved) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const row = event.target.closest?.('[data-tree-row]')
  // Il campo di testo di rinomina o creazione tiene le sue frecce.
  if (!row || event.target !== row) return
  const rows = [...event.currentTarget.querySelectorAll('[data-tree-row]')]
  const index = rows.indexOf(row)
  const go = (target) => { if (target) { event.preventDefault(); target.focus(); target.scrollIntoView({ block: 'nearest' }); onMoved?.(target) } }
  const isFolder = row.dataset.treeRow === 'directory'
  const expanded = row.getAttribute('aria-expanded') === 'true'
  if (event.key === 'ArrowDown') go(rows[index + 1])
  else if (event.key === 'ArrowUp') go(rows[index - 1])
  else if (event.key === 'Home') go(rows[0])
  else if (event.key === 'End') go(rows[rows.length - 1])
  else if (event.key === 'ArrowRight' && isFolder) {
    event.preventDefault()
    if (!expanded) row.click()
    else if (Number(rows[index + 1]?.dataset.depth) > Number(row.dataset.depth)) go(rows[index + 1])
  } else if (event.key === 'ArrowLeft') {
    if (isFolder && expanded) { event.preventDefault(); row.click() } else {
      const depth = Number(row.dataset.depth)
      go(rows.slice(0, index).reverse().find((candidate) => Number(candidate.dataset.depth) < depth))
    }
  }
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
    // Solo le cartelle si leggono: un file Markdown "espanso" mostra il suo originale, che è già in `entry.originals`.
    if (expanded && entry.isDirectory) load()
  }, [expanded, refreshToken, load])

  const indent = { paddingLeft: 8 + depth * 14 }
  const rowClass = 'flex w-full items-center gap-1.5 py-1 pr-2 text-left text-sm outline-none transition hover:bg-slate-800/70 focus-visible:bg-slate-800 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent-400'

  if (!entry.isDirectory) {
    const active = entry.path === activePath
    const hasOriginals = Boolean(entry.originals?.length)
    return (
      <div>
        <button
          type="button"
          data-tree-row="file"
          data-tree-path={entry.path}
          data-depth={depth}
          style={indent}
          title={entry.path}
          draggable={menu.renaming !== entry.path}
          onDragStart={(event) => drop.start(event, entry)}
          onDragEnd={drop.end}
          onDragOver={(event) => drop.over(event, parentOf(entry.path))}
          onDrop={(event) => drop.drop(event, parentOf(entry.path))}
          className={`${rowClass} ${menu.isSelected(entry.path) ? 'bg-accent-500/25 text-slate-50' : active ? 'bg-slate-800 text-slate-50' : 'text-slate-400'}`}
          onClick={(event) => { if (menu.pick(event, entry)) return; menu.select(parentOf(entry.path)); onOpenFile(entry.path, { preview: true }) }}
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
            : isImageFile(entry.name) ? <ImageIcon size={14} className="shrink-0 text-slate-500" /> : <File size={14} className="shrink-0 text-slate-500" />}
          {menu.renaming === entry.path ? <RenameInput entry={entry} onCommit={menu.commitRename} onCancel={menu.cancelRename} /> : <span className="truncate">{entry.name}</span>}
        </button>
        {hasOriginals && expanded && entry.originals.map((original) => (
          <button
            key={original.path}
            type="button"
            data-tree-row="file"
            data-tree-path={original.path}
            data-depth={depth + 1}
            style={{ paddingLeft: 8 + (depth + 1) * 14 }}
            title={`${original.path} · ${t('Original, read-only')}`}
            className={`${rowClass} ${menu.isSelected(original.path) ? 'bg-accent-500/25 text-slate-50' : original.path === activePath ? 'bg-slate-800 text-slate-50' : 'text-slate-500'}`}
            onClick={(event) => { if (menu.pick(event, { ...original, isDirectory: false })) return; onOpenFile(original.path, { original: true, preview: true }) }}
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
        data-tree-row="directory"
        data-tree-path={entry.path}
        data-depth={depth}
        style={indent}
        aria-expanded={expanded}
        title={entry.isProject ? t('Sub-project') : undefined}
        draggable={menu.renaming !== entry.path}
        onDragStart={(event) => drop.start(event, entry)}
        onDragEnd={drop.end}
        className={`${rowClass} text-slate-300 ${drop.target === entry.path ? 'bg-accent-500/20 ring-1 ring-inset ring-accent-400' : menu.isSelected(entry.path) ? 'bg-accent-500/25' : menu.selected === entry.path ? 'bg-slate-800/60' : ''}`}
        onClick={(event) => { if (menu.pick(event, entry)) return; menu.select(entry.path); onToggle(entry.path) }}
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
      {expanded && menu.creating?.parent === entry.path && <CreateRow depth={depth + 1} menu={menu} />}
      {expanded && children?.length === 0 && menu.creating?.parent !== entry.path && <p style={{ paddingLeft: 8 + (depth + 1) * 14 + 20 }} className="py-1 text-xs text-slate-500">{t('Empty')}</p>}
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
  const treeRef = useRef(null)

  // Rida il focus alla riga di un percorso. L'albero si ridisegna (e le cartelle si rileggono) dopo una rinomina: si riprova per qualche fotogramma.
  const focusRow = (target) => {
    const same = (left, right) => left.replace(/[\\/]+/g, '/').toLowerCase() === right.replace(/[\\/]+/g, '/').toLowerCase()
    let attempts = 20
    const attempt = () => {
      const row = [...(treeRef.current?.querySelectorAll('[data-tree-path]') || [])].find((item) => same(item.dataset.treePath, target))
      if (row) { row.focus(); row.scrollIntoView({ block: 'nearest' }) } else if (attempts-- > 0) requestAnimationFrame(attempt)
    }
    requestAnimationFrame(attempt)
  }
  // Nuova cartella o nuovo documento: { parent, type: 'directory' | 'file' } con il nome in corso di digitazione.
  const [creating, setCreating] = useState(null)
  // Cartella "corrente": l'ultima cliccata (o quella del file cliccato). I pulsanti Nuova cartella / Nuovo documento della barra creano lì; senza selezione, nella radice.
  const [selectedFolder, setSelectedFolder] = useState(null)
  const [newName, setNewName] = useState('')
  const openMenu = useContext(ContextMenuContext)

  // Elimina uno o più elementi con una sola conferma. Il processo principale risponde con i percorsi eliminati: gli elementi e i loro originali (DOCX/PDF).
  const deleteEntries = async (paths) => {
    try {
      const deleted = await electronAPI.deletePaths(paths)
      if (deleted) {
        for (const item of deleted) onDeleted(item)
        setSelection([])
        setSelectedFolder(null)
        setLocalRefresh((value) => value + 1)
      }
    } catch (reason) {
      onStatus(t('Delete failed: {message}', { message: reason.message }))
    }
  }
  const deleteEntry = (entry) => deleteEntries([entry.path])

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

  const creationTarget = () => selectedFolder || project
  // Cambiando progetto la cartella corrente non vale più.
  useEffect(() => { setSelectedFolder(null) }, [project])

  function startCreate(parent, type) {
    // La cartella di destinazione si apre, così la riga di creazione si vede dove comparirà il nuovo elemento.
    if (parent !== project && !expandedPaths.has(parent)) onToggle(parent)
    setCreating({ parent, type })
    setNewName('')
  }

  function cancelCreate() {
    setCreating(null)
    setNewName('')
  }

  async function commitCreate() {
    const name = newName.trim()
    if (!name || !creating) return
    const { parent, type } = creating
    try {
      const created = await electronAPI.createEntry({ parent, name, type })
      cancelCreate()
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
    creating,
    newName,
    setNewName,
    commitCreate,
    cancelCreate,
    selected: selectedFolder,
    select: setSelectedFolder,
    isSelected: (path) => selection.some((item) => samePath(item, path)),
    // Clic con Ctrl/Cmd (aggiunge o toglie) o Maiusc (intervallo): cambia solo la selezione, non apre né espande. Il clic semplice seleziona solo quella riga e prosegue.
    pick(event, entry) {
      if (event.ctrlKey || event.metaKey) {
        setSelection((current) => (current.some((item) => samePath(item, entry.path)) ? current.filter((item) => !samePath(item, entry.path)) : [...current, entry.path]))
        anchorRef.current = entry.path
        return true
      }
      if (event.shiftKey) { selectRange(entry.path); return true }
      selectOnly(entry.path)
      return false
    },
    open(event, entry) {
      event.preventDefault()
      event.stopPropagation()
      // Tasto destro su una riga della selezione: il menu vale per tutta la selezione; su una riga fuori dalla selezione, questa diventa la selezione.
      const inSelection = selectionRef.current.some((item) => samePath(item, entry.path))
      if (selectionRef.current.length > 1 && inSelection) {
        const paths = topLevel(selectionRef.current)
        openMenu({
          x: event.clientX,
          y: event.clientY,
          items: [
            { label: t('{count} items selected', { count: paths.length }), disabled: true },
            { separator: true },
            { label: t('Copy'), hint: 'Ctrl+C', onClick: () => copyEntries(paths, false) },
            { label: t('Cut'), hint: 'Ctrl+X', onClick: () => copyEntries(paths, true) },
            { separator: true },
            { label: t('Delete'), hint: t('Del'), danger: true, onClick: () => deleteEntries(paths) },
          ],
        })
        return
      }
      if (!inSelection) selectOnly(entry.path)
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
          { label: t('Copy'), hint: 'Ctrl+C', onClick: () => copyToClipboard(entry, false) },
          { label: t('Cut'), hint: 'Ctrl+X', onClick: () => copyToClipboard(entry, true) },
          { label: t('Paste'), hint: 'Ctrl+V', onClick: () => pasteFromClipboard(entry.isDirectory ? entry.path : parentOf(entry.path)) },
          { separator: true },
          { label: t('Rename'), hint: 'F2', onClick: () => setRenaming(entry.path) },
          { label: t('Delete'), hint: t('Del'), danger: true, onClick: () => deleteEntry(entry) },
          { separator: true },
          { label: revealLabel, onClick: () => electronAPI.revealPath(entry.path) },
        ].filter(Boolean),
      })
    },
    key(event, entry) {
      if (renaming) return
      // Ctrl+C / Ctrl+X / Ctrl+V: appunti di file del sistema (si incolla anche nel file manager o in altri programmi, e viceversa).
      const together = selectionRef.current.length > 1 && selectionRef.current.some((item) => samePath(item, entry.path))
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.target === event.currentTarget) {
        const shortcut = event.key.toLowerCase()
        if ((shortcut === 'c' || shortcut === 'x') && together) { event.preventDefault(); copyEntries(topLevel(selectionRef.current), shortcut === 'x'); return }
        if (shortcut === 'c' || shortcut === 'x') { event.preventDefault(); copyToClipboard(entry, shortcut === 'x'); return }
        if (shortcut === 'v') { event.preventDefault(); pasteFromClipboard(entry.isDirectory ? entry.path : parentOf(entry.path)); return }
      }
      if (event.key === 'F2') { event.preventDefault(); setRenaming(entry.path) }
      if (event.key === 'Delete') { event.preventDefault(); if (together) deleteEntries(topLevel(selectionRef.current)); else deleteEntry(entry) }
    },
    cancelRename(entry, { keepFocus } = {}) {
      setRenaming(null)
      if (keepFocus && entry) focusRow(entry.path)
    },
    async commitRename(entry, newName, { keepFocus } = {}) {
      setRenaming(null)
      const name = newName.trim()
      if (!name || name === entry.name) { if (keepFocus) focusRow(entry.path); return }
      try {
        const destination = await electronAPI.renamePath({ path: entry.path, newName: name })
        onRenamed(entry.path, destination)
        // Gli originali (DOCX/PDF) mostrati sotto il documento prendono il nuovo nome con lui.
        const newStem = destination.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '')
        for (const original of entry.originals || []) onRenamed(original.path, `${parentOf(original.path)}${original.path.slice(parentOf(original.path).length, original.path.length - original.name.length)}${newStem}${original.name.replace(/^.*(\.[^.]*)$/, '$1')}`)
        setSelectedFolder(null)
        setLocalRefresh((value) => value + 1)
        if (keepFocus) focusRow(destination)
      } catch (reason) {
        onStatus(t('Rename failed: {message}', { message: reason.message }))
      }
    },
  }

  // Appunti di file del sistema: copiati o tagliati qui si incollano nel file manager o in altri programmi; quelli copiati altrove si incollano qui.
  const copyToClipboard = async (entry, cut) => {
    try {
      await electronAPI.copyFilesToClipboard({ paths: [entry.path], cut })
      onStatus(cut ? t('Cut: {name}', { name: entry.name }) : t('Copied: {name}', { name: entry.name }))
    } catch (reason) {
      onStatus(reason.message)
    }
  }
  // Più elementi negli appunti di sistema (copia o taglia).
  const copyEntries = async (paths, cut) => {
    try {
      await electronAPI.copyFilesToClipboard({ paths, cut })
      const name = t('{count} items', { count: paths.length })
      onStatus(cut ? t('Cut: {name}', { name }) : t('Copied: {name}', { name }))
    } catch (reason) {
      onStatus(reason.message)
    }
  }
  const pasteFromClipboard = async (directory) => {
    try {
      const result = await electronAPI.pasteFilesFromClipboard({ targetDirectory: directory })
      if (result.empty) { onStatus(t('The clipboard has no files')); return }
      for (const move of result.moved) onRenamed(move.from, move.to)
      setSelectedFolder(null)
      setLocalRefresh((value) => value + 1)
      const parts = []
      if (result.moved.length) parts.push(t('{count} moved', { count: result.moved.length }))
      if (result.copied.length) parts.push(t('{count} copied', { count: result.copied.length }))
      if (result.skipped) parts.push(t('{count} skipped (not supported or not usable here)', { count: result.skipped }))
      if (result.externalCut && result.copied.length) parts.push(t('the originals were left where they are'))
      onStatus(parts.join(' · ') || t('Nothing was pasted'))
      if (result.copied.length === 1 && !result.moved.length) focusRow(result.copied[0])
    } catch (reason) {
      onStatus(reason.message)
    }
  }

  // Trascinamento dei file. In uscita il file è trascinato dal sistema (si può rilasciare in un'altra applicazione o nel file manager,
  // per allegarlo o copiarlo lì). Lo stesso trascinamento, rilasciato nell'albero, sposta l'elemento se viene dal progetto; i file che
  // arrivano da fuori si copiano nella cartella sotto il puntatore, o nella radice del progetto.
  // Selezione multipla: i percorsi selezionati e il punto da cui parte la selezione con Maiusc. Ctrl/Cmd+clic aggiunge o toglie una riga, Maiusc+clic
  // (o Maiusc+frecce) seleziona l'intervallo, Ctrl/Cmd+A tutto, Esc annulla. Trascinamento, menu, copia, taglia ed elimina valgono per tutta la selezione.
  const [selection, setSelection] = useState([])
  const selectionRef = useRef([])
  selectionRef.current = selection
  const anchorRef = useRef(null)
  useEffect(() => { setSelection([]); anchorRef.current = null }, [project])
  const visibleRows = () => [...(treeRef.current?.querySelectorAll('[data-tree-path]') || [])].map((row) => row.dataset.treePath)
  // Un elemento dentro una cartella selezionata segue la cartella: non si conta a parte (non si trascina né si elimina due volte).
  const topLevel = (paths) => paths.filter((item) => !paths.some((other) => other !== item && isInsidePath(item, other)))
  const selectRange = (path) => {
    const rows = visibleRows()
    const to = rows.findIndex((row) => samePath(row, path))
    if (to === -1) return
    const found = rows.findIndex((row) => samePath(row, anchorRef.current ?? path))
    const from = found === -1 ? to : found
    setSelection(rows.slice(Math.min(from, to), Math.max(from, to) + 1))
  }
  const selectOnly = (path) => { setSelection([path]); anchorRef.current = path }

  // Cosa si sta trascinando dall'albero. Il trascinamento passa dal sistema, e una CARTELLA non sempre arriva al rilascio con il proprio percorso
  // tra i file del trascinamento (per i file sì): senza questo promemoria rilasciare una cartella in un'altra non faceva nulla. Si dimentica
  // appena il mouse si muove di nuovo (durante il trascinamento del sistema la pagina non riceve movimenti), così non resta addosso a un rilascio diverso.
  const internalDrag = useRef(null)
  useEffect(() => {
    const forget = () => { internalDrag.current = null }
    window.addEventListener('mousemove', forget, true)
    return () => window.removeEventListener('mousemove', forget, true)
  }, [])

  const drop = {
    target: dropTarget,
    start(event, entry) {
      event.preventDefault()
      // Una riga della selezione porta con sé tutta la selezione; una riga fuori dalla selezione parte da sola (e diventa la selezione).
      const together = selectionRef.current.length > 1 && selectionRef.current.some((item) => samePath(item, entry.path))
      const paths = together ? topLevel(selectionRef.current) : [entry.path]
      if (!together) selectOnly(entry.path)
      internalDrag.current = paths
      electronAPI.startDrag(paths)
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
      // Una cartella può comparire tra gli elementi del trascinamento e non tra i file: si guardano entrambi.
      const fromItems = Array.from(event.dataTransfer.items || []).filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter(Boolean)
      let paths = electronAPI.getDroppedPaths([...Array.from(event.dataTransfer.files), ...fromItems])
      const dragged = internalDrag.current
      internalDrag.current = null
      if (dragged && paths.length < dragged.length) paths = dragged
      if (!paths.length) { onStatus(t('Could not read the path of the dropped items')); return }
      const folderName = directory === project ? name : directory.split(/[\\/]/).filter(Boolean).at(-1)
      // Tutto ciò che viene dal progetto stesso si sposta (cronologia, note e memoria lo seguono, anche per un sotto-progetto).
      if (paths.every((item) => isInsideProject(item, project))) {
        let moved = 0
        // Un originale (DOCX/PDF) trascinato insieme al suo Markdown viaggia con lui: lo sposta il processo principale, qui si aggiornano solo le schede aperte.
        const stem = (item) => item.replace(/^.*[\\/]/, '').replace(/\.[^.]*$/, '').toLowerCase()
        const isOriginalOfListed = (item) => /\.(docx|pdf)$/i.test(item) && paths.some((other) => other !== item && /\.md$/i.test(other) && parentOf(other) === parentOf(item) && stem(other) === stem(item))
        const originals = paths.filter(isOriginalOfListed)
        for (const from of paths.filter((item) => !isOriginalOfListed(item))) {
          if (parentOf(from) === directory || from === directory) continue
          try {
            const destination = await electronAPI.moveIntoDirectory({ from, toDirectory: directory })
            if (destination !== from) {
              onRenamed(from, destination)
              moved += 1
              for (const original of originals.filter((item) => parentOf(item) === parentOf(from) && stem(item) === stem(from))) onRenamed(original, `${parentOf(destination)}${original.slice(parentOf(original).length)}`)
            }
          } catch (reason) {
            onStatus(t('Move failed: {message}', { message: reason.message }))
          }
        }
        if (moved) {
          setSelection([])
          setSelectedFolder(null)
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
  // Cartelle di riferimento: stanno fuori dal progetto, l'assistente le legge (come @sigla/…) ma non le modifica; se spostate si ricollegano.
  const [references, setReferences] = useState([])
  useEffect(() => {
    if (!project) { setReferences([]); return }
    electronAPI.listReferences().then(setReferences).catch(() => setReferences([]))
  }, [project, token])
  const addReference = async () => {
    try {
      const updated = await electronAPI.addReference()
      if (updated) { setReferences(updated); onStatus(t('Reference folder added')) }
    } catch (reason) { onStatus(reason.message) }
  }
  const relinkReference = async (reference) => {
    try {
      const updated = await electronAPI.updateReference(reference.name)
      if (updated) { setReferences(updated); onStatus(t('Reference updated')) }
    } catch (reason) { onStatus(reason.message) }
  }
  const removeReference = async (reference) => {
    try { setReferences(await electronAPI.removeReference(reference.name)) } catch (reason) { onStatus(reason.message) }
  }
  const openReferenceMenu = (event, reference) => {
    event.preventDefault()
    openMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        !reference.missing && { label: revealLabel, onClick: () => electronAPI.revealReference(reference.name).catch((reason) => onStatus(reason.message)) },
        { label: t('Relink…'), onClick: () => relinkReference(reference) },
        { separator: true },
        { label: t('Remove reference'), danger: true, onClick: () => removeReference(reference) },
      ].filter(Boolean),
    })
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
        <button type="button" aria-label={t('New folder…')} title={selectedFolder && selectedFolder !== project ? t('New folder in {folder}', { folder: selectedFolder.split(/[\\/]/).filter(Boolean).at(-1) }) : t('New folder…')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => startCreate(creationTarget(), 'directory')}><FolderPlus size={14} /></button>
        <button type="button" aria-label={t('New document…')} title={selectedFolder && selectedFolder !== project ? t('New document in {folder}', { folder: selectedFolder.split(/[\\/]/).filter(Boolean).at(-1) }) : t('New document…')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => startCreate(creationTarget(), 'file')}><FilePlus size={14} /></button>
        <button type="button" aria-label={t('Add a reference folder…')} title={t('Add a reference folder…')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={addReference}><Library size={14} /></button>
        <button type="button" aria-label={t('Move a project here…')} title={t('Move a project here…')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => moveProjectIn(project)}><FolderInput size={14} /></button>
        <button type="button" aria-label={t('Refresh')} title={t('Refresh')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => setLocalRefresh((value) => value + 1)}><RefreshCw size={14} /></button>
        <button type="button" aria-label={t('Project settings')} title={t('Project settings')} className="rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-50" onClick={() => setSubSettings({ path: project, name })}><Settings size={14} /></button>
      </div>
      {subSettings && (
        <ProjectSettingsDialog
          title={subSettings.name}
          path={subSettings.path}
          label={subSettings.path === project ? t('Project settings') : t('Sub-project settings')}
          onClose={() => setSubSettings(null)}
          onEditContext={(file) => { setSubSettings(null); onOpenFile(file) }}
          onChanged={() => onSettingsChanged?.()}
        />
      )}
      <div
        ref={treeRef}
        className={`min-h-0 flex-1 overflow-y-auto py-1 ${dropTarget === project ? 'bg-accent-500/10 ring-1 ring-inset ring-accent-400' : ''}`}
        onKeyDown={(event) => {
          // Selezione da tastiera (solo su una riga: i campi di rinomina e creazione tengono i loro tasti).
          if (event.target.matches?.('[data-tree-row]')) {
            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === 'a') {
              event.preventDefault()
              setSelection(visibleRows())
              return
            }
            if (event.key === 'Escape' && selectionRef.current.length) { setSelection([]); return }
            if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              const rows = [...event.currentTarget.querySelectorAll('[data-tree-row]')]
              const next = rows[rows.indexOf(event.target) + (event.key === 'ArrowDown' ? 1 : -1)]
              event.preventDefault()
              if (next) {
                if (anchorRef.current === null) anchorRef.current = event.target.dataset.treePath
                next.focus()
                next.scrollIntoView({ block: 'nearest' })
                selectRange(next.dataset.treePath)
              }
              return
            }
          }
          navigateTree(event, (row) => {
            // Una freccia semplice porta la selezione sulla riga raggiunta.
            if (row.dataset.treePath) selectOnly(row.dataset.treePath)
            // Con un'immagine aperta, passare con le frecce su un'altra immagine la mostra nella stessa scheda (anteprima), senza togliere il focus all'albero.
            const target = row.dataset.treePath
            if (target && row.dataset.treeRow === 'file' && isImageFile(target) && isImageFile(activePath)) onOpenFile(target, { preview: true })
          })
        }}
        onDragOver={(event) => drop.over(event, project)}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null) }}
        onDrop={(event) => drop.drop(event, project)}
      >
        {error && <p className="px-3 py-2 text-xs text-rose-400">{error}</p>}
        {!error && entries.length === 0 && <p className="px-3 py-2 text-xs text-slate-500">{t('No documents (.md, .docx, .pdf) in this folder. Drop files here to copy them.')}</p>}
        {creating?.parent === project && <CreateRow depth={0} menu={menu} />}
        {entries.map((entry) => (
          <TreeNode key={entry.path} entry={entry} depth={0} activePath={activePath} refreshToken={token} expandedPaths={expandedPaths} onToggle={onToggle} onOpenFile={onOpenFile} drop={drop} menu={menu} />
        ))}
        {references.length > 0 && (
          <div className="mt-2 border-t border-slate-800 pt-1">
            <h3 className="flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500" title={t('Folders outside the project, linked here as references: the assistant can read them (as @name/…) but never changes them.')}><Library size={12} /> {t('References')}</h3>
            {references.map((reference) => (
              <div key={reference.name} onContextMenu={(event) => openReferenceMenu(event, reference)} className={`group flex items-center pr-1 text-sm transition hover:bg-slate-800/70 ${reference.missing ? 'text-slate-600' : 'text-slate-400'}`}>
                <button type="button" title={reference.missing ? `${reference.path} · ${t('Folder not found')}` : `${reference.path}\n${t('Click to open the folder in the file manager')}`} className="flex min-w-0 flex-1 items-center gap-1.5 py-1 pl-3 text-left" onClick={() => (reference.missing ? relinkReference(reference) : electronAPI.revealReference(reference.name).catch((reason) => onStatus(reason.message)))}>
                  <span className="w-3.5 shrink-0" />
                  <Folder size={14} className={`shrink-0 ${reference.missing ? 'text-slate-600' : 'text-accent-400'}`} />
                  <span className={`truncate ${reference.missing ? 'line-through' : ''}`}>@{reference.name}</span>
                  <Lock size={11} className="shrink-0 text-slate-600" aria-label={t('Read-only for the assistant')} />
                </button>
                {reference.missing && <button type="button" aria-label={t('Relink…')} title={t('Relink…')} className="rounded p-1 text-amber-500 transition hover:bg-slate-700 hover:text-amber-300" onClick={() => relinkReference(reference)}><Link2 size={12} /></button>}
                <button type="button" aria-label={t('Remove reference')} title={t('Remove reference (the folder is not touched)')} className="rounded p-1 text-slate-500 opacity-0 transition hover:bg-slate-700 hover:text-slate-50 group-hover:opacity-100 focus:opacity-100" onClick={() => removeReference(reference)}><X size={12} /></button>
              </div>
            ))}
          </div>
        )}
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
