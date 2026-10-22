import { createToolRunner } from './aiTools.js'
import { getPending } from './pendingChangesExtension.js'
import { isInsidePath, samePath } from './pathCompare.js'
import { t } from '../i18n/index.js'

/**
 * Richieste di modifica che arrivano dal server MCP (un agente esterno, tramite il ponte del processo principale): si eseguono con gli stessi
 * strumenti dell'assistente interno (replace_text, insert_text, replace_document), quindi con le stesse regole: le modifiche restano nell'editor,
 * segnate "da rivedere" (accetta/rifiuta), annullabili con Ctrl+Z, e non si scrive nulla nel file finché l'utente non salva.
 */
const READ_DEFAULT_CHARS = 20000
const READ_MAX_CHARS = 40000
const SNAPSHOT_EVERY_MS = 60_000
const lastSnapshot = new Map()

const isAbsolute = (value) => /^([A-Za-z]:[\\/]|\\\\|\/)/.test(value)

// Un agente raggiunge solo i documenti del progetto, quelli collegati al progetto e quelli già aperti in OpenWriter (anche fuori dalla cartella:
// aprirli nell'editor li rende parte dell'area di lavoro attiva). Qualunque altro percorso è rifiutato prima di aprire o toccare qualcosa.
async function authorizeDocument(given, { api, toolBridge, project }) {
  if (!isAbsolute(given)) {
    if (given.replace(/\\/g, '/').split('/').some((part) => part === '..' || part === '.ow')) throw new Error('The path is not accessible: it must be a document of the project, a document linked to the project, or a document open in OpenWriter')
    return
  }
  if (samePath(given, project) || isInsidePath(given, project)) return
  try { toolBridge.getDocument(given); return } catch { /* non è aperto */ }
  let links = []
  try { links = (await api.listLinks()) || [] } catch { /* senza collegamenti */ }
  if (links.some((link) => samePath(link.path, given))) return
  throw new Error('The path is not accessible: it must be a document of the project, a document linked to the project, or a document open in OpenWriter')
}

const OPENABLE_DOCUMENT = /\.(md|markdown|mdown|txt|docx|pdf)$/i

export async function handleMcpRequest({ tool, args = {} }, { api, toolBridge, project, activate, notify, refreshNotes, openProject, setStatus }) {
  // Cambiare progetto non richiede un progetto aperto, né che sia quello dell'agente.
  if (tool === 'open_project') {
    const directory = String(args.path ?? '').trim()
    if (!isAbsolute(directory)) throw new Error('Give the absolute path of the project folder')
    const opened = await openProject(directory)
    if (!opened) throw new Error('The project could not be opened')
    setStatus?.(t("An agent opened the project “{project}”", { project: opened }))
    return `Project ${opened} is now open in OpenWriter.`
  }
  if (!project) throw new Error('No project is open in OpenWriter')
  const given = String(args.path ?? '').trim()
  // Aprire un documento è l'unico modo per un agente di portare nell'area di lavoro un file fuori dal progetto: l'utente lo vede aprirsi in una scheda.
  if (tool === 'open_document') {
    if (!given) throw new Error('Missing parameter "path"')
    if (isAbsolute(given) && !OPENABLE_DOCUMENT.test(given)) throw new Error('Only documents can be opened (.md, .txt, .docx, .pdf)')
  } else if (given) await authorizeDocument(given, { api, toolBridge, project })

  // Quello che l'utente vede in questo momento (modifiche non salvate e da rivedere comprese), mentre il file su disco può essere più vecchio.
  if (tool === 'read_open_document') {
    let found
    try { found = toolBridge.getDocument(given || undefined) } catch (error) {
      throw new Error(`${error.message}. Use read_document to read the file saved on disk.`)
    }
    const { tab, editor } = found
    const markdown = editor.getMarkdown()
    const offset = Math.max(0, Number.parseInt(args.offset, 10) || 0)
    const size = Math.min(READ_MAX_CHARS, Math.max(1, Number.parseInt(args.limit, 10) || READ_DEFAULT_CHARS))
    const content = markdown.slice(offset, offset + size)
    const end = offset + content.length
    return JSON.stringify({
      title: tab.title,
      unsavedChanges: Boolean(tab.dirty),
      editsWaitingForReview: getPending(editor.state).length,
      totalChars: markdown.length,
      offset,
      content,
      truncated: end < markdown.length,
      nextOffset: end < markdown.length ? end : null,
    }, null, 2)
  }

  let edited = null
  const run = createToolRunner({
    api,
    project,
    enabled: { edit: true, notes: true },
    getDocument: (path) => toolBridge.getDocument(path),
    openFile: (absolutePath) => toolBridge.openFile(absolutePath),
    onNotesChanged: refreshNotes,
    onBookmarksChanged: () => {},
    onDocumentEdited: (tab) => { edited = tab },
    onDocumentOpened: () => {},
    // La versione precedente va in cronologia prima della modifica, al più una volta al minuto per documento.
    beforeEdit: async (tab, editor) => {
      const now = Date.now()
      if (now - (lastSnapshot.get(tab.id) || 0) < SNAPSHOT_EVERY_MS) return
      lastSnapshot.set(tab.id, now)
      await toolBridge.snapshot(tab, editor)
    },
  })

  // Un documento indicato che non è aperto in una scheda si apre prima: gli strumenti lavorano sull'editor.
  if (given) {
    try { toolBridge.getDocument(given) } catch { await run('open_document', { path: given }) }
  }
  const result = await run(tool, args)
  if (edited) {
    activate(edited.id)
    notify(edited.title)
  }
  return result
}
