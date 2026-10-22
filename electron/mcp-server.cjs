#!/usr/bin/env node
/**
 * Server MCP di OpenWriter (stdio).
 *
 * Mette a disposizione degli agenti esterni (Claude Code, Codex, OpenCode, client integrati negli IDE…) ciò che i soli file non mostrano:
 * contesto e istruzioni del progetto, skill, note, segnalibri, memoria, oltre a elenco, lettura e ricerca dei documenti.
 * Non scrive mai nei file dei documenti. Può aggiungere note, correzioni proposte (note con testo sostitutivo) e segnalibri, che l'utente rivede
 * in OpenWriter e accetta o rifiuta, e, con l'app aperta, modificare i documenti aperti nell'editor (replace_text, insert_text, replace_document):
 * le modifiche arrivano come "da rivedere", con accetta/rifiuta, tramite un ponte locale verso l'app (vedi mcp-bridge.cjs). Con `--read-only`
 * gli strumenti di scrittura non esistono. Il resto non dipende da Electron, quindi funziona anche con l'app chiusa.
 *
 * Quali documenti si raggiungono (modello di accesso, vedi authorizedDocument): i documenti del progetto, i documenti collegati al progetto e quelli
 * aperti in OpenWriter (anche fuori dalla cartella: aprirli nell'editor li rende parte dell'area di lavoro attiva). Nient'altro: un percorso
 * qualunque del disco viene rifiutato. Cartelle, elenco e ricerca riguardano solo la cartella del progetto.
 *
 * Il progetto è, in ordine: `--project <cartella>` (o OPENWRITER_PROJECT); la `.ow` più vicina risalendo dalla cartella in cui parte l'agente;
 * il progetto aperto nell'app (workspace.json nei dati dell'app, riletto a ogni chiamata). `--data <cartella>` indica i dati dell'app.
 *
 * Protocollo: JSON-RPC 2.0 con un messaggio per riga su stdin/stdout. Su stdout passano solo messaggi del protocollo; i diagnostici vanno su stderr.
 */
const fs = require('node:fs')
const http = require('node:http')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')
const { pathToFileURL } = require('node:url')
const { createProjectFile } = require('./project-file.cjs')
const { createNotesStore } = require('./notes-store.cjs')
const { createBookmarksStore } = require('./bookmarks-store.cjs')
const { createMemoryStore } = require('./memory-store.cjs')
const { createSkillsStore } = require('./skills-store.cjs')
const { createProjectTools } = require('./project-tools.cjs')
const { createLinksStore } = require('./project-links.cjs')
const { isSameOrInside, samePath } = require('./path-compare.cjs')
const { findOwners } = require('./project-owner.cjs')
const { analyzeMarkdown, markdownToPlain } = require('./markdown-plain.cjs')

const SERVER_VERSION = '1.0.0'
const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const SEARCH_EXTENSIONS = /\.(md|markdown|mdown|txt)$/i
const SKIPPED_NAMES = new Set(['.ow', '.git', 'node_modules'])
const MAX_SEARCH_RESULTS = 50
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024
const DOCUMENT_EXTENSIONS = /\.(md|markdown|mdown|txt|docx|pdf)$/i
const TREE_DEFAULT_ENTRIES = 1000
const TREE_MAX_ENTRIES = 5000

const log = (...parts) => process.stderr.write(`[openwriter-mcp] ${parts.join(' ')}\n`)

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--project' || flag === '--data') result[flag.slice(2)] = argv[(index += 1)]
    else if (flag === '--read-only') result.readOnly = true
    else if (flag.startsWith('--project=')) result.project = flag.slice('--project='.length)
    else if (flag.startsWith('--data=')) result.data = flag.slice('--data='.length)
  }
  return result
}

const args = parseArguments(process.argv.slice(2))

function defaultDataDirectory() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'OpenWriter')
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'OpenWriter')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'OpenWriter')
}

const dataDirectory = path.resolve(args.data || process.env.OPENWRITER_DATA || defaultDataDirectory())
const isDirectory = (target) => { try { return fs.statSync(target).isDirectory() } catch { return false } }

// Progetto da usare, e come è stato scelto. Si rilegge a ogni chiamata solo nel caso dell'app (può cambiare progetto mentre il server gira).
function resolveProject() {
  const explicit = args.project || process.env.OPENWRITER_PROJECT
  if (explicit) {
    const target = path.resolve(explicit)
    if (!isDirectory(target)) throw new Error(`The project folder does not exist: ${target}`)
    return { path: target, source: 'argument' }
  }
  let directory = path.resolve(process.cwd())
  for (let guard = 0; guard < 64; guard += 1) {
    if (isDirectory(path.join(directory, '.ow'))) return { path: directory, source: 'working-directory' }
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  try {
    const { project } = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'workspace.json'), 'utf8'))
    if (project && isDirectory(project)) return { path: path.resolve(project), source: 'open-in-app' }
  } catch { /* nessun progetto aperto nell'app */ }
  throw new Error('No project found: open one in OpenWriter, or start the agent inside a project folder (one that has a .ow folder), or pass --project <folder>.')
}

const projectPath = () => resolveProject().path
const mainDirectory = () => path.join(dataDirectory, 'main')

const projectFile = createProjectFile({ getProjectPath: projectPath, getMainPath: mainDirectory })
const notesStore = createNotesStore({ getProjectPath: projectPath, getMainPath: mainDirectory })
const bookmarksStore = createBookmarksStore({ getProjectPath: projectPath, getMainPath: mainDirectory })
const memoryStore = createMemoryStore({ getProjectPath: projectPath })
const skillsStore = createSkillsStore({ getGlobalDirectory: () => path.join(dataDirectory, 'skills') })

// DOCX si legge come nell'app; il PDF richiede la conversione che fa l'app (diventa un .md accanto all'originale).
async function readDocument(filePath) {
  if (path.extname(filePath).toLowerCase() === '.docx') {
    const mammoth = require('mammoth')
    const converted = await mammoth.convertToHtml({ buffer: fs.readFileSync(filePath) })
    return { content: converted.value }
  }
  throw new Error('PDF files cannot be read from here: open the PDF in OpenWriter, which converts it to a Markdown file next to it, then read that file.')
}
const linksStore = createLinksStore({ getProjectPath: projectPath })
const projectTools = createProjectTools({ getProjectPath: projectPath, readDocument })

const posix = (value) => value.split(path.sep).join('/')

// Percorso di un documento dato dall'agente (relativo al progetto o assoluto) → assoluto, mai fuori dal progetto né dentro `.ow`.
// Cartella o file DENTRO il progetto (percorso relativo, o assoluto purché dentro la cartella del progetto), mai in .ow, .git o node_modules.
function projectPathInside(value) {
  const project = projectPath()
  const target = path.resolve(project, String(value || ''))
  const relative = path.relative(project, target)
  if (!relative || !isSameOrInside(project, target)) throw new Error('The path is outside the project')
  if (relative.split(path.sep).some((part) => SKIPPED_NAMES.has(part))) throw new Error('This path is not accessible')
  return target
}

// Modello di accesso ai DOCUMENTI. L'agente raggiunge solo:
//   1. i documenti del progetto (percorso relativo alla radice, o assoluto dentro la cartella del progetto);
//   2. i documenti collegati al progetto (.ow/links.json: file fuori dalla cartella, aggiunti dall'utente come parte del progetto);
//   3. i documenti aperti in OpenWriter, anche fuori dalla cartella: aprirli nell'editor li rende parte dell'area di lavoro attiva.
// Qualunque altro percorso assoluto è rifiutato: un agente non può leggere né annotare file arbitrari del disco.
function linkedDocuments() {
  try { return linksStore.list().map((link) => link.path) } catch { return [] }
}

function openDocumentFiles(project) {
  const open = appContext(project)?.open || []
  return open.map((item) => item.path).filter(Boolean).map((file) => path.resolve(project, file))
}

function authorizedDocument(value) {
  const project = projectPath()
  const given = String(value || '').trim()
  if (!given) throw new Error('Missing document path')
  const target = path.resolve(project, given)
  if (isSameOrInside(project, target)) return projectPathInside(given)
  if (linkedDocuments().some((link) => samePath(link, target))) return target
  if (openDocumentFiles(project).some((file) => samePath(file, target))) return target
  throw new Error('The path is not accessible: it must be a document of the project, a document linked to the project, or a document open in OpenWriter')
}

const relativeTo = (project, target) => posix(path.relative(project, target)) || '.'

// Schede aperte in OpenWriter per il progetto, come l'app le ha salvate nella sessione (sessions.json): quale documento l'utente ha in primo piano.
// Se l'app è chiusa è l'ultimo stato prima della chiusura.
function readAppSession(project) {
  try {
    const sessions = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'sessions.json'), 'utf8'))
    const key = Object.keys(sessions).find((item) => item !== '__none__' && samePath(item, project))
    return key ? sessions[key] : null
  } catch { return null }
}

function openedInApp(project) {
  try {
    const { project: open } = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'workspace.json'), 'utf8'))
    return samePath(open, project)
  } catch { return false }
}

function describeTab(project, tab) {
  const file = tab.filePath || tab.sourcePath || null
  const inside = file && path.resolve(file) !== path.resolve(project) && isSameOrInside(project, path.resolve(file))
  return {
    title: tab.title,
    path: file ? (inside ? relativeTo(project, path.resolve(file)) : path.resolve(file)) : null,
    insideProject: Boolean(inside),
    unsavedChanges: Boolean(tab.dirty),
    ...(file ? (tab.dirty ? { note: 'it has unsaved changes in OpenWriter: the file on disk may be older than what the user sees' } : {}) : { note: 'draft not saved to a file yet' }),
  }
}

// Documento in primo piano e schede aperte; null se l'app non ha una sessione per questo progetto.
function appContext(project) {
  const session = readAppSession(project)
  if (!session || !Array.isArray(session.tabs)) return null
  const documents = session.tabs.filter((tab) => !tab.closed)
  const active = documents.find((tab) => tab.id === session.activeId) || null
  return {
    active: active ? describeTab(project, active) : null,
    open: documents.map((tab) => describeTab(project, tab)),
    isOpenInApp: openedInApp(project),
  }
}

// Percorso (assoluto, dentro al progetto) del documento in primo piano, se è un file del progetto.
function activeDocumentFile() {
  const project = projectPath()
  const active = appContext(project)?.active
  return active?.path ? path.resolve(project, active.path) : null
}

function contextChain(document) {
  const file = document ? authorizedDocument(document) : activeDocumentFile()
  return projectFile.getContextChain(file || null)
}

// Albero del progetto in una sola chiamata: lo restituiscono read_project e list_documents (che di default scende nelle sottocartelle).
function projectTree({ path: folder, maxDepth, documentsOnly, maxEntries }) {
  const project = projectPath()
  const start = folder && folder !== '.' ? projectPathInside(folder) : project
  const depthLimit = Math.min(30, Math.max(1, Number(maxDepth) || 12))
  const limit = Math.min(TREE_MAX_ENTRIES, Math.max(1, Number(maxEntries) || TREE_DEFAULT_ENTRIES))
  const onlyDocuments = isTrue(documentsOnly)
  const lines = []
  let files = 0
  let folders = 0
  let cut = false
  let visited = 0
  const describe = (stats) => `${stats.size < 1024 ? `${stats.size} B` : stats.size < 1048576 ? `${Math.round(stats.size / 1024)} KB` : `${(stats.size / 1048576).toFixed(1)} MB`}, ${new Date(stats.mtimeMs).toISOString().slice(0, 10)}`

  // Restituisce le righe di una cartella (senza aggiungerle) per poter omettere le cartelle senza documenti con documentsOnly.
  const walk = (directory, depth) => {
    let entries = []
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return [] }
    entries = entries.filter((entry) => !SKIPPED_NAMES.has(entry.name) && !entry.name.startsWith('.'))
    entries.sort((left, right) => Number(right.isDirectory()) - Number(left.isDirectory()) || left.name.localeCompare(right.name, 'it', { sensitivity: 'base' }))
    const out = []
    for (const entry of entries) {
      visited += 1
      if (visited > TREE_MAX_ENTRIES * 4) break
      const full = path.join(directory, entry.name)
      const indent = '  '.repeat(depth)
      if (entry.isDirectory()) {
        const marker = isDirectory(path.join(full, '.ow')) ? ' [sub-project]' : ''
        const inner = depth + 1 < depthLimit ? walk(full, depth + 1) : [{ line: `${'  '.repeat(depth + 1)}…`, file: false, note: true, content: true }]
        const hasContent = inner.some((item) => item.file || item.content)
        if (onlyDocuments && !hasContent) continue
        out.push({ line: `${indent}${entry.name}/${marker}`, file: false }, ...inner)
      } else {
        if (onlyDocuments && !DOCUMENT_EXTENSIONS.test(entry.name)) continue
        let detail = ''
        try { detail = ` (${describe(fs.statSync(full))})` } catch { /* file sparito nel frattempo */ }
        out.push({ line: `${indent}${entry.name}${detail}`, file: true })
      }
    }
    return out
  }

  for (const item of walk(start, 0)) {
    if (lines.length >= limit) { cut = true; break }
    lines.push(item.line)
    if (item.file) files += 1
    else if (!item.note) folders += 1
  }
  const where = relativeTo(project, start)
  return [
    `${where === '.' ? path.basename(project) : where}/  — ${folders} folders, ${files} files${onlyDocuments ? ' (documents only)' : ''}${cut ? `, CUT at ${limit} entries: narrow it with "path" or "documentsOnly"` : ''}`,
    ...lines.map((line) => `  ${line}`),
  ].join('\n')
}

const PROJECT_TREE_TOOL = {
  name: 'read_project',
  description: 'Alias of list_documents (which is recursive by default): the whole project in ONE call, every folder and file, as an indented tree (folders end with "/", sub-projects are marked, files show size and last-modified date). Hidden folders, .ow, .git and node_modules are left out. Large projects are cut at maxEntries (the answer says so): then narrow it with "path" or "documentsOnly", or lower "maxDepth".',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'folder relative to the project root (default: the whole project)' },
      maxDepth: { type: 'integer', minimum: 1, maximum: 30, description: 'how many folder levels to descend (default 12)' },
      documentsOnly: { type: 'boolean', description: 'only documents (.md, .markdown, .txt, .docx, .pdf), and the folders that contain them' },
      maxEntries: { type: 'integer', minimum: 1, maximum: TREE_MAX_ENTRIES, description: `maximum number of entries (default ${TREE_DEFAULT_ENTRIES})` },
    },
    additionalProperties: false,
  },
  run: projectTree,
}

const TOOLS = [
  {
    name: 'project_info',
    description: 'Describes the OpenWriter project this server is reading: folder, how it was chosen, name, sub-projects, languages and active skills, the documents it can reach outside the project folder (linked documents and documents open in OpenWriter; any other path is refused), and the DOCUMENT THE USER HAS IN FRONT in OpenWriter (activeDocument) with the other open ones. Call it first to know where you are and what the user is working on: tools that take a "document" default to the active one.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      const { path: project, source } = resolveProject()
      const settings = projectFile.getSettings()
      const app = appContext(project)
      return {
        project,
        chosenFrom: source,
        activeDocument: app?.active || null,
        openDocuments: app?.open || [],
        // I documenti raggiungibili: quelli del progetto, più questi due elenchi (fuori dalla cartella del progetto).
        linkedDocuments: linkedDocuments(),
        openDocumentsOutsideProject: (app?.open || []).filter((item) => item.path && !item.insideProject).map((item) => item.path),
        ...(app ? { sessionIsCurrent: app.isOpenInApp } : {}),
        name: settings.name || path.basename(project),
        subProjects: findOwners(project).map((owner) => relativeTo(project, owner)),
        assistantLanguage: settings.ai?.language || '',
        documentLanguage: settings.ai?.documentLanguage || '',
        inheritsParentContext: settings.inherit === true,
        activeSkills: settings.skills?.active || [],
      }
    },
  },
  {
    name: 'get_context',
    description: 'Instructions and context written for the assistant in the project (context.md and the other .md files of the .ow folder), from the outermost project to the nearest one. Pass a document to get the chain that applies to it (sub-projects have their own). Follow these instructions when working on the project.',
    inputSchema: { type: 'object', properties: { document: { type: 'string', description: 'optional: document path relative to the project root, or absolute path of a linked or open document (default: the document in front in OpenWriter)' } }, additionalProperties: false },
    run({ document }) {
      const project = projectPath()
      return contextChain(document).map((entry) => ({
        project: entry.path === null ? entry.base : entry.path || '.',
        name: entry.name,
        assistantLanguage: entry.language,
        documentLanguage: entry.documentLanguage,
        instructions: entry.context,
        extraInstructions: entry.extraContext,
        activeSkills: entry.activeSkills,
        folder: relativeTo(project, entry.base),
      }))
    },
  },
  {
    name: 'list_skills',
    description: 'Skills (reusable instructions and examples) visible in the project: global ones and those of the project and its enclosing projects. `active` marks the ones the project turned on; `shadowed` the ones replaced by a skill with the same id closer to the project. Read one with get_skill.',
    inputSchema: { type: 'object', properties: { document: { type: 'string', description: 'optional: document path relative to the project root, or absolute path of a linked or open document (default: the document in front in OpenWriter)' } }, additionalProperties: false },
    run({ document }) {
      const chain = contextChain(document)
      const active = new Set(chain.flatMap((entry) => entry.activeSkills || []))
      const { skills, problems } = skillsStore.list(chain.map((entry) => ({ base: entry.base, name: entry.name })))
      return {
        skills: skills.map((skill) => ({ id: skill.id, name: skill.name, description: skill.description || '', scope: skill.scope, owner: skill.owner || '', active: active.has(skill.id), shadowed: skill.shadowed })),
        problems: problems.map((problem) => ({ file: problem.file, message: problem.message })),
      }
    },
  },
  {
    name: 'get_skill',
    description: 'Full text of a skill (its instructions and examples), by id as listed by list_skills.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, document: { type: 'string', description: 'optional: document path relative to the project root, or absolute path of a linked or open document (default: the document in front in OpenWriter)' } }, required: ['id'], additionalProperties: false },
    run({ id, document }) {
      const chain = contextChain(document)
      const { skills } = skillsStore.list(chain.map((entry) => ({ base: entry.base, name: entry.name })))
      const found = skills.find((skill) => skill.id === id && !skill.shadowed)
      if (!found) throw new Error(`Skill not found: ${id}`)
      const skill = skillsStore.get({ scope: found.scope, base: found.base, id })
      return { id, scope: skill.scope, owner: found.owner || '', markdown: skill.markdown }
    },
  },
  PROJECT_TREE_TOOL,
  {
    name: 'list_documents',
    description: 'Lists the files and folders of the project: by default RECURSIVE, so one call returns the whole hierarchy below the folder (default: the root) as an indented tree with sizes and dates; folders that are sub-projects are flagged. Call it once and read_document what you need: do not descend folder by folder. Pass recursive=false to see only ONE folder (folders first, sizes/times as numbers, optionally sort=date). Large projects are cut at maxEntries (the answer says so): narrow it with "path" or "documentsOnly", or lower "maxDepth".',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'folder relative to the project root (default ".")' },
        recursive: { type: 'boolean', description: 'true by default: include everything below the folder. false: only the folder itself' },
        sort: { type: 'string', enum: ['name', 'date'], description: 'only with recursive=false: "date" lists the most recently modified first' },
        maxDepth: { type: 'integer', minimum: 1, maximum: 30, description: 'recursive: how many folder levels to descend (default 12)' },
        documentsOnly: { type: 'boolean', description: 'recursive: only documents (.md, .markdown, .txt, .docx, .pdf), and the folders that contain them' },
        maxEntries: { type: 'integer', minimum: 1, maximum: TREE_MAX_ENTRIES, description: `recursive: maximum number of entries (default ${TREE_DEFAULT_ENTRIES})` },
      },
      additionalProperties: false,
    },
    run: (args) => (args.recursive === false || args.recursive === 'false'
      ? projectTools.listDirectory(args.path || '.', { sort: args.sort === 'date' ? 'date' : 'name' })
      : projectTree(args)),
  },
  {
    name: 'read_document',
    description: 'Reads a document as text (.md, .txt, .docx): a document of the project, a document linked to the project, or a document open in OpenWriter (see project_info). Long ones come in chunks: use `offset` with the `nextOffset` of the previous answer. It returns what is saved on disk: edits still being reviewed in OpenWriter are not included.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'document: path relative to the project root, or the absolute path of a linked or open document (default: the document in front in OpenWriter)' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, description: 'maximum characters (default 20000, max 40000)' } }, additionalProperties: false },
    run({ path: file, offset, limit }) {
      const target = text(file).trim() ? authorizedDocument(file) : activeDocumentFile()
      if (!target) throw new Error('Missing parameter "path", and OpenWriter has no document in front (see project_info)')
      const project = projectPath()
      // Dentro il progetto con il percorso relativo; un documento collegato o aperto fuori dalla cartella con il percorso assoluto (già autorizzato qui sopra).
      return isSameOrInside(project, target) ? projectTools.readFile(relativeTo(project, target), { offset, limit }) : projectTools.readFile(target, { offset, limit, absolute: true })
    },
  },
  {
    name: 'read_open_document',
    description: 'Reads a document as the user sees it right now in OpenWriter: with unsaved changes and edits waiting for review included, while read_document returns the saved file (possibly older). Use it before editing a document that is open (project_info shows activeDocument and its unsavedChanges). Needs the OpenWriter app running.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'document: path relative to the project root, or the absolute path of a linked or open document (default: the document in front in OpenWriter)' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, description: 'maximum characters (default 20000, max 40000)' } }, additionalProperties: false },
    run: (args) => bridgeCall('read_open_document', args),
  },
  {
    name: 'search_documents',
    description: 'Case-insensitive text search in the project Markdown and text files (sub-projects included). Returns file, line number and the line.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string', description: 'optional: limit to a folder relative to the project root' }, maxResults: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_RESULTS } }, required: ['query'], additionalProperties: false },
    run({ query, path: folder, maxResults }) {
      const needle = String(query || '').toLowerCase()
      if (!needle.trim()) throw new Error('The query is empty')
      const project = projectPath()
      const start = folder ? projectPathInside(folder) : project
      const limit = Math.min(MAX_SEARCH_RESULTS, Math.max(1, Number(maxResults) || 20))
      const matches = []
      let total = 0
      const walk = (directory) => {
        let entries = []
        try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return }
        entries.sort((left, right) => left.name.localeCompare(right.name))
        for (const entry of entries) {
          if (SKIPPED_NAMES.has(entry.name) || entry.name.startsWith('.')) continue
          const full = path.join(directory, entry.name)
          if (entry.isDirectory()) { walk(full); continue }
          if (!SEARCH_EXTENSIONS.test(entry.name)) continue
          let text
          try { if (fs.statSync(full).size > MAX_SEARCH_FILE_BYTES) continue; text = fs.readFileSync(full, 'utf8') } catch { continue }
          if (!text.toLowerCase().includes(needle)) continue
          text.split(/\r?\n/).forEach((line, index) => {
            if (!line.toLowerCase().includes(needle)) return
            total += 1
            if (matches.length < limit) matches.push({ path: relativeTo(project, full), line: index + 1, text: line.trim().slice(0, 240) })
          })
        }
      }
      walk(start)
      return { query, total, shown: matches.length, matches }
    },
  },
  {
    name: 'list_notes',
    description: 'Notes (comments and suggested replacements) attached to passages of the project documents, with the quoted text they refer to, author (user or ai) and status (open, accepted, rejected, resolved). Without `document` it lists all the notes of the project, grouped by document. By default only open ones.',
    inputSchema: { type: 'object', properties: { document: { type: 'string', description: 'only this document (relative to the project root, or the absolute path of a linked or open one); omit for all the documents of the project' }, status: { type: 'string', enum: ['open', 'accepted', 'rejected', 'resolved', 'all'], description: 'default "open"' } }, additionalProperties: false },
    run({ document, status }) {
      const wanted = status || 'open'
      const pick = (notes) => notes.filter((note) => wanted === 'all' || note.status === wanted).map((note) => ({ id: note.id, kind: note.kind, status: note.status, author: note.author, quote: note.quote, body: note.body, ...(note.replacement !== null && note.replacement !== undefined ? { replacement: note.replacement } : {}), ...(note.resolution ? { resolution: note.resolution } : {}), createdAt: note.createdAt }))
      if (document) return { documents: [{ path: document, notes: pick(notesStore.list(authorizedDocument(document))) }] }
      return { documents: notesStore.listAll().map((entry) => ({ path: entry.path, notes: pick(entry.notes) })).filter((entry) => entry.notes.length) }
    },
  },
  {
    name: 'list_bookmarks',
    description: 'Bookmarks: named points of the documents (anchored to a quoted passage). Some are flagged for the assistant\'s attention, with a note saying why. Link form between documents: file.md#bookmark-name. Without `document` it lists all of the project.',
    inputSchema: { type: 'object', properties: { document: { type: 'string', description: 'only this document (relative to the project root, or the absolute path of a linked or open one); omit for all the documents of the project' }, flaggedOnly: { type: 'boolean', description: 'only the bookmarks flagged for the assistant' } }, additionalProperties: false },
    run({ document, flaggedOnly }) {
      const pick = (items) => items.filter((item) => !flaggedOnly || item.flagged).map((item) => ({ name: item.name, label: item.label, quote: item.quote, note: item.note, flagged: item.flagged, author: item.author }))
      if (document) return { documents: [{ path: document, bookmarks: pick(bookmarksStore.list(authorizedDocument(document))) }] }
      return { documents: bookmarksStore.listAll().map((entry) => ({ path: entry.path, bookmarks: pick(entry.bookmarks) })).filter((entry) => entry.bookmarks.length) }
    },
  },
  {
    name: 'list_memory',
    description: 'Project memory: lasting information saved by the user or by the assistant (decisions, terms, style rules, facts), each possibly linked to files.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => ({ entries: memoryStore.list() }),
  },
]

// ---- Scritture: sempre revisionabili. Non toccano mai il testo dei documenti: note, correzioni proposte (note con testo sostitutivo) e segnalibri.

const MAX_QUOTE = 2000
const MAX_BOOKMARK_QUOTE = 400
const MAX_NOTE_BODY = 4000
const MAX_BATCH = 20
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const text = (value) => String(value ?? '')
const isTrue = (value) => value === true || value === 'true'

// Documento Markdown e il suo testo piano (quello a cui si ancorano le note).
function loadMarkdown(value) {
  let file
  if (text(value).trim()) file = authorizedDocument(value)
  else {
    file = activeDocumentFile()
    if (!file) throw new Error('Missing parameter "document", and OpenWriter has no document in front (see project_info)')
  }
  if (!/\.(md|markdown|mdown)$/i.test(file)) throw new Error('Notes, suggestions and bookmarks can only be added to Markdown documents (.md)')
  let markdown
  try { markdown = fs.readFileSync(file, 'utf8') } catch { throw new Error(`Document not found: ${value}`) }
  return { file, ...analyzeMarkdown(markdown) }
}

// Occorrenze della citazione nel testo piano: esatte, poi tollerando spazi e a capo (come l'editor).
function findAll(plain, quote) {
  const needle = text(quote)
  if (!needle.trim()) return []
  const hits = []
  for (let index = plain.indexOf(needle); index !== -1; index = plain.indexOf(needle, index + needle.length)) hits.push({ index, length: needle.length })
  if (hits.length) return hits
  const pattern = needle.trim().split(/\s+/).map(escapeRegExp).join('\\s+')
  for (const match of plain.matchAll(new RegExp(pattern, 'g'))) hits.push({ index: match.index, length: match[0].length })
  return hits
}

// La citazione deve comparire una sola volta nel testo piano; si provano anche le varianti senza i simboli del Markdown (come quando la si copia da read_document).
function locateHit(plain, quote, label = 'The quote') {
  const raw = text(quote)
  const unescaped = raw.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, '$1')
  let hits = []
  // Anche la citazione copiata da read_document, con i simboli del Markdown (link, grassetto, elenchi…), ridotta a testo piano.
  for (const variant of [raw, unescaped, unescaped.replace(/(\*\*|__|`)/g, ''), markdownToPlain(raw)]) {
    hits = variant.trim() ? findAll(plain, variant) : []
    if (hits.length) break
  }
  if (!hits.length) throw new Error(`${label} not found in the document. Give the text as plain words, without Markdown markers (no **, #, list dashes or link syntax), copied exactly and within one paragraph or heading.`)
  if (hits.length > 1) throw new Error(`${label} appears ${hits.length} times: use a longer, unique passage.`)
  return hits[0]
}

// Citazione, e il contesto che la distingue, da salvare con la nota o il segnalibro.
function locateUnique(plain, quote, label) {
  const hit = locateHit(plain, quote, label)
  return {
    quote: plain.slice(hit.index, hit.index + hit.length),
    prefix: plain.slice(Math.max(0, hit.index - 40), hit.index),
    suffix: plain.slice(hit.index + hit.length, hit.index + hit.length + 40),
  }
}

function checkLength(value, limit, label) {
  if (text(value).length > limit) throw new Error(`${label} is too long (${text(value).length} characters, at most ${limit}): split it into several parts.`)
}

function addOneNote(document, plain, item) {
  if (!text(item.body).trim()) throw new Error('Missing parameter "body"')
  checkLength(item.body, MAX_NOTE_BODY, 'The note')
  checkLength(item.quote, MAX_QUOTE, 'The quote')
  const anchor = locateUnique(plain, item.quote)
  const hasReplacement = item.replacement !== undefined && item.replacement !== null
  if (hasReplacement) {
    checkLength(item.replacement, MAX_NOTE_BODY, 'The replacement')
    if (text(item.replacement) === anchor.quote) throw new Error('The replacement is identical to the quote: there is nothing to correct')
  }
  const note = notesStore.add(document, { kind: hasReplacement ? 'suggestion' : 'comment', ...anchor, body: text(item.body), replacement: hasReplacement ? text(item.replacement) : null, author: 'ai' })
  return `Note ${note.id} added (${note.kind}) on “${anchor.quote.slice(0, 80)}”.`
}

// Link a un segnalibro: percorso relativo alla radice del progetto se il documento è dentro, altrimenti un indirizzo file:/// (tra unità diverse di
// Windows, per esempio da D: a E:, un percorso relativo non esiste).
function bookmarkLink(file, name) {
  const project = projectPath()
  const target = `${isSameOrInside(project, file) ? relativeTo(project, file) : pathToFileURL(file).href}#${name}`
  return /\s/.test(target) ? `<${target}>` : target
}

// Chiamata al ponte dell'app aperta (porta e token in mcp-bridge.json nei dati dell'app). Lancia con un messaggio chiaro se l'app non c'è.
function bridgeCall(tool, args) {
  let bridge
  try { bridge = JSON.parse(fs.readFileSync(path.join(dataDirectory, 'mcp-bridge.json'), 'utf8')) } catch { bridge = null }
  const notRunning = 'OpenWriter does not seem to be running (or this install has no editing bridge). Open the app with this project to edit documents in the editor; meanwhile you can leave notes and suggestions (add_note, suggest_insertion), which do not need the app.'
  if (!bridge?.port || !bridge?.token) return Promise.reject(new Error(notRunning))
  let project = null
  try { project = projectPath() } catch { /* open_project funziona anche senza un progetto */ }
  const payload = JSON.stringify({ project, tool, arguments: args })
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: bridge.port, path: '/call', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Authorization: `Bearer ${bridge.token}` }, timeout: 130000 }, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { body += chunk })
      response.on('end', () => {
        let parsed
        try { parsed = JSON.parse(body) } catch { reject(new Error(`Unexpected answer from OpenWriter (${response.statusCode})`)); return }
        if (parsed.ok) resolve(String(parsed.text ?? ''))
        else reject(new Error(parsed.error || `OpenWriter refused the request (${response.statusCode})`))
      })
    })
    request.on('timeout', () => request.destroy(new Error('OpenWriter did not answer in time')))
    request.on('error', (error) => reject(error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET' ? new Error(notRunning) : error))
    request.end(payload)
  })
}

const EDIT_NOTE = 'It happens in the OpenWriter editor: the change is marked for the user to accept or reject (standard review), can be undone with Ctrl+Z, and NOTHING is written to the file until the user saves. The document must belong to the project (a document that is not open is opened in a tab). Needs the OpenWriter app running. For remarks, doubts or suggestions that do not need to be applied now, prefer add_note.'

const WRITE_TOOLS = [
  {
    name: 'create_file',
    description: 'Creates a NEW document in the project (.md, or .txt; ".md" is added if the path has no extension), with the given content, creating the missing folders. It never overwrites: an existing path is refused, and so is a name already used by another document of the project unless allowSameName is true. The file is written straight to disk (a new file replaces nothing, and the user can delete it) and appears in the OpenWriter explorer at once. Only inside the project folder, never in .ow, .git or node_modules. Once created you can add notes and bookmarks to it.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'path of the new file, relative to the project root (folders are created as needed)' }, content: { type: 'string', description: 'full text of the document (Markdown for .md); empty by default' }, allowSameName: { type: 'boolean', description: 'true only if a second document with the same name as one in another folder is really wanted' } }, required: ['path'], additionalProperties: false },
    async run({ path: file, content, allowSameName }) {
      const result = await projectTools.createFile(text(file), text(content), { allowSameName: isTrue(allowSameName) })
      return `Created ${result.path} (${text(content).length} characters).`
    },
  },
  {
    name: 'create_folder',
    description: 'Creates a folder in the project (and the missing parent folders); if it already exists nothing happens. Only inside the project folder, never in .ow, .git or node_modules.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'folder path relative to the project root' } }, required: ['path'], additionalProperties: false },
    async run({ path: folder }) {
      const result = await projectTools.createDirectory(text(folder))
      return result.created ? `Created the folder ${result.path}.` : `The folder ${result.path} already exists.`
    },
  },
  {
    name: 'open_document',
    description: 'Opens a document in a tab of the OpenWriter editor and brings it in front, so the user sees it. The path is relative to the project root, or the absolute path of a file OUTSIDE the project (.md, .txt, .docx, .pdf): opening it makes it part of the active workspace, so afterwards you can read it (read_open_document, read_document) and annotate it. Needs the OpenWriter app running with this project open.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'path relative to the project root, or absolute path of a document outside the project' } }, required: ['path'], additionalProperties: false },
    run: (args) => bridgeCall('open_document', args),
  },
  {
    name: 'open_project',
    description: 'Opens a project folder in the OpenWriter app (the current session is saved and the app switches to that project). The path is the absolute path of the folder. Needs the OpenWriter app running. This server keeps working on the project it was started with (--project, or the folder the agent started in); only when it follows the project open in the app (no --project and no .ow in the working directory) does it move to the new project too.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'absolute path of the project folder' } }, required: ['path'], additionalProperties: false },
    run: (args) => bridgeCall('open_project', args),
  },
  {
    name: 'replace_text',
    description: `Replaces one passage of a document, directly in the editor. "find" is the EXACT text to replace as read_document / read_open_document show it (plain text or Markdown source, for example a whole link [text](url)) and must appear only once: use a longer passage if it does not. "replace" is the new Markdown (empty to delete). Open notes on the replaced passage are marked resolved. ${EDIT_NOTE}`,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'document: path relative to the project root, or the absolute path of a linked or open document (default: the document in front in OpenWriter)' }, find: { type: 'string' }, replace: { type: 'string', description: 'new text, empty string to delete' } }, required: ['find', 'replace'], additionalProperties: false },
    run: (args) => bridgeCall('replace_text', args),
  },
  {
    name: 'insert_text',
    description: `Inserts Markdown into a document, directly in the editor: at the "end" (default) or "start", or "after"/"before" an anchor passage given as EXACT text that appears only once. ${EDIT_NOTE}`,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'document: path relative to the project root, or the absolute path of a linked or open document (default: the document in front in OpenWriter)' }, text: { type: 'string', description: 'Markdown to insert' }, position: { type: 'string', enum: ['after', 'before', 'start', 'end'] }, anchor: { type: 'string', description: 'with after/before: exact text next to which to insert' } }, required: ['text'], additionalProperties: false },
    run: (args) => bridgeCall('insert_text', args),
  },
  {
    name: 'replace_document',
    description: `Rewrites the WHOLE document in the editor with the given Markdown. Only for real rewrites: read the document first and write it complete (a much shorter text is refused unless allow_shrink is true). For small changes use replace_text. ${EDIT_NOTE}`,
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'document: path relative to the project root, or the absolute path of a linked or open document (default: the document in front in OpenWriter)' }, content: { type: 'string', description: 'the complete new text, in Markdown' }, allow_shrink: { type: 'boolean', description: 'true only if the new text is meant to be much shorter' } }, required: ['content'], additionalProperties: false },
    run: (args) => bridgeCall('replace_document', args),
  },
  {
    name: 'add_note',
    description: 'Adds a note to a Markdown document of the project, anchored to a passage. The user sees it highlighted in OpenWriter and decides. Without "replacement" it is a remark (also the way to record a doubt, a TODO or a development note about the document). To PROPOSE A CHANGE to the text, give "replacement": it is a suggestion that the user can accept (the passage is replaced) or reject. "quote" is the passage as plain words (no Markdown markers), unique in the document and within one paragraph or heading; for a suggestion it must be the WHOLE passage to replace and "replacement" the COMPLETE new passage, in Markdown (with its syntax: # for headings, - for lists), ready to apply. A passage that spans several blocks (a heading and what follows, a whole list) is quoted with its blocks on separate lines and must start and end at block boundaries; do not quote a part of a list. Several notes can go in one call with "notes" (up to 20). The document file itself is never modified.',
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'document path relative to the project root (default: the document in front in OpenWriter, see project_info)' },
        quote: { type: 'string', description: 'plain text of the passage to anchor to (at most 2000 characters)' },
        body: { type: 'string', description: 'the note: what you observe, or why you propose the change' },
        replacement: { type: 'string', description: 'optional, makes it a suggestion: the complete Markdown that replaces the quote' },
        notes: { type: 'array', description: 'alternative to quote/body/replacement: several notes for the same document', items: { type: 'object', properties: { quote: { type: 'string' }, body: { type: 'string' }, replacement: { type: 'string' } }, required: ['quote', 'body'] } },
      },
      additionalProperties: false,
    },
    run(args) {
      const { file, plain } = loadMarkdown(args.document)
      const items = Array.isArray(args.notes) && args.notes.length ? args.notes : [args]
      if (items.length > MAX_BATCH) throw new Error(`Too many notes in one call (at most ${MAX_BATCH})`)
      const results = items.map((item, position) => {
        try { return addOneNote(file, plain, item) } catch (error) {
          if (items.length === 1) throw error
          return `Note ${position + 1} NOT added: ${error.message}`
        }
      })
      return `${results.join('\n')}\nThe user reviews them in OpenWriter (Notes panel) and can accept, reject or resolve them.`
    },
  },
  {
    name: 'suggest_insertion',
    description: 'Proposes adding new content after a paragraph or a heading (for example a new paragraph or section in a development document). It creates a suggestion that the user can accept or reject. "after" is any words from that paragraph or heading, unique in the document: the whole block is the anchor and keeps its formatting. It does not work inside lists, quotes, tables or code blocks (anchor on the paragraph or heading next to them, or use add_note with a "replacement" covering the whole passage). To change existing text use add_note with "replacement".',
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'document path relative to the project root (default: the document in front in OpenWriter, see project_info)' },
        after: { type: 'string', description: 'words from the paragraph or heading after which the content goes (unique in the document)' },
        markdown: { type: 'string', description: 'the Markdown to insert after the anchor passage' },
        body: { type: 'string', description: 'why this should be added' },
      },
      required: ['after', 'markdown', 'body'],
      additionalProperties: false,
    },
    run({ document, after, markdown, body }) {
      const { file, plain, blocks } = loadMarkdown(document)
      if (!text(markdown).trim()) throw new Error('Missing parameter "markdown"')
      const { index } = locateHit(plain, after, 'The anchor passage')
      const block = blocks.find((item) => index >= item.start && index < item.end)
      if (!block) throw new Error('The anchor passage was not found as a block of the document')
      if (block.type !== 'paragraph' && block.type !== 'heading') throw new Error(`The anchor is inside a ${block.type} block: anchor on the paragraph or heading next to it, or use add_note with a "replacement" covering the whole passage`)
      // L'ancora è l'intero blocco e la sostituzione lo riscrive com'era (col suo Markdown: titolo, grassetti, link) seguito dal testo nuovo.
      return addOneNote(file, plain, { quote: plain.slice(block.start, block.end), body, replacement: `${block.raw}\n\n${text(markdown).trim()}` })
    },
  },
  {
    name: 'update_note',
    description: 'Revises a note written by the assistant (not the user\'s notes): its text or proposed replacement, or reopens/resolves it. Resolving is allowed on any note (give "resolution": why it is closed without being applied). It cannot accept or reject: that is the user\'s choice. To answer a note of the user, add a new note.',
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'document path relative to the project root (default: the document in front in OpenWriter, see project_info)' },
        id: { type: 'string', description: 'note id, as listed by list_notes' },
        body: { type: 'string' },
        replacement: { type: 'string', description: 'new proposed replacement (a remark becomes a suggestion)' },
        status: { type: 'string', enum: ['open', 'resolved'] },
        resolution: { type: 'string', description: 'with status "resolved": why' },
        quote: { type: 'string', description: 'plain text the note should now be anchored to, when the passage was edited' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    run({ document, id, body, replacement, status, resolution, quote }) {
      const { file, plain } = loadMarkdown(document)
      const note = notesStore.list(file).find((item) => item.id === id)
      if (!note) throw new Error('Note not found')
      const changes = {}
      if (body !== undefined || replacement !== undefined) {
        if (note.author !== 'ai') throw new Error('That note was written by the user: you can resolve it or answer with a new note, not rewrite it')
        if (body !== undefined) { checkLength(body, MAX_NOTE_BODY, 'The note'); changes.body = text(body) }
        if (replacement !== undefined) { checkLength(replacement, MAX_NOTE_BODY, 'The replacement'); changes.replacement = text(replacement); changes.kind = 'suggestion' }
      }
      if (status !== undefined) {
        if (status !== 'open' && status !== 'resolved') throw new Error('status must be "open" or "resolved": accepting or rejecting is the user\'s choice')
        changes.status = status
        if (resolution !== undefined) changes.resolution = text(resolution)
      }
      if (quote !== undefined && text(quote).trim()) { checkLength(quote, MAX_QUOTE, 'The quote'); Object.assign(changes, locateUnique(plain, quote)) }
      if (!Object.keys(changes).length) throw new Error('Nothing to change: pass body, replacement, status, resolution or quote')
      const updated = notesStore.update(file, id, changes)
      return `Note ${updated.id} updated (${updated.kind}, ${updated.status}).`
    },
  },
  {
    name: 'add_bookmark',
    description: 'Adds a bookmark: a named anchor at a point of a Markdown document, which can be linked from any document as [text](path/to/file.md#name), or used to mark a point for the user (flagged bookmarks catch their attention, with a note saying why). "quote" is a short passage of plain words at that point (a heading or the first words of a paragraph), unique in the document.',
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'document path relative to the project root (default: the document in front in OpenWriter, see project_info)' },
        quote: { type: 'string', description: 'short plain text at the point (at most 400 characters)' },
        name: { type: 'string', description: 'optional name for links (lowercase letters, digits, hyphens; derived from the label if omitted)' },
        label: { type: 'string', description: 'optional short title shown in the bookmarks list' },
        note: { type: 'string', description: 'optional remark about the point' },
        flagged: { type: 'boolean', description: 'flag it for the user\'s attention' },
      },
      required: ['quote'],
      additionalProperties: false,
    },
    run({ document, quote, name, label, note, flagged }) {
      const { file, plain } = loadMarkdown(document)
      checkLength(quote, MAX_BOOKMARK_QUOTE, 'The quote')
      const anchor = locateUnique(plain, quote)
      const bookmark = bookmarksStore.add(file, { ...anchor, name: text(name), label: text(label), note: text(note), flagged: isTrue(flagged), author: 'ai' })
      return `Bookmark "${bookmark.name}" added on “${anchor.quote.slice(0, 80)}”. Link to it as [text](${bookmarkLink(file, bookmark.name)}) (angle brackets are needed when the path has spaces; a relative path is relative to the project root: adjust it to the document that contains the link; a document outside the project gets a file:/// address).`
    },
  },
  {
    name: 'update_bookmark',
    description: 'Changes a bookmark (by its name): label, note, flag, new name (links using the old name stop working) or the passage it is anchored to.',
    inputSchema: {
      type: 'object',
      properties: {
        document: { type: 'string', description: 'document path relative to the project root (default: the document in front in OpenWriter, see project_info)' },
        name: { type: 'string', description: 'current name of the bookmark' },
        newName: { type: 'string' },
        label: { type: 'string' },
        note: { type: 'string' },
        flagged: { type: 'boolean' },
        quote: { type: 'string', description: 'plain text to re-anchor the bookmark to, when its passage was edited' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    run({ document, name, newName, label, note, flagged, quote }) {
      const { file, plain } = loadMarkdown(document)
      const found = bookmarksStore.list(file).find((item) => item.name === name)
      if (!found) throw new Error(`Bookmark not found: ${name}`)
      const changes = {}
      if (newName !== undefined) changes.name = text(newName)
      if (label !== undefined) changes.label = text(label)
      if (note !== undefined) changes.note = text(note)
      if (flagged !== undefined) changes.flagged = isTrue(flagged)
      if (quote !== undefined && text(quote).trim()) { checkLength(quote, MAX_BOOKMARK_QUOTE, 'The quote'); Object.assign(changes, locateUnique(plain, quote)) }
      if (!Object.keys(changes).length) throw new Error('Nothing to change: pass newName, label, note, flagged or quote')
      const updated = bookmarksStore.update(file, found.id, changes)
      return `Bookmark "${updated.name}" updated.`
    },
  },
]

const READ_ONLY = args.readOnly === true || /^(1|true)$/i.test(process.env.OPENWRITER_READ_ONLY || '')
const ACTIVE_TOOLS = READ_ONLY ? TOOLS : [...TOOLS, ...WRITE_TOOLS]

// Rinforzo: gli agenti tendono a esplorare con list_documents una cartella alla volta anche quando potrebbero vedere tutto in una chiamata.
const EXPLORE_RULE = 'EXPLORING THE PROJECT: list_documents is recursive by default (read_project is an alias): ONE call returns every folder and file below the folder, so call it once at the start, keep the tree in mind and go straight to read_document for the files you need. Do not walk the project folder by folder. Pass recursive=false only to look at a single folder with numeric sizes/times or sorted by date. If the answer says the tree was CUT, narrow it (path, documentsOnly, maxDepth) and call it again.'

const INSTRUCTIONS = (READ_ONLY
  ? 'Read-only access to an OpenWriter project (a local Markdown workspace): call project_info first (it says which document the user has in front: the tools that take a document default to it), then read_project to see every file in one call, get_context for the instructions written for the assistant and list_skills / get_skill for the project skills. Notes, bookmarks and memory record the workflow around the documents. This server never edits anything: edit the files with your own tools.'
  : 'Access to an OpenWriter project (a local Markdown workspace): call project_info first (it says which document the user has in front: the tools that take a document default to it), then read_project to see every file in one call, get_context for the instructions written for the assistant and list_skills / get_skill for the project skills. Notes, bookmarks and memory record the workflow around the documents. This server never writes to the document files. To work on the user\'s documentation (for example development documents) while you code: leave notes (add_note), propose changes as suggestions (add_note with "replacement", suggest_insertion) and set bookmarks, create new documents and folders (create_file, create_folder), or, when the user asks you to change a document directly, edit it in the OpenWriter editor with replace_text / insert_text (read it first with read_open_document, which includes unsaved changes). Every one of these is reviewed by the user in OpenWriter, who accepts or rejects it; direct edits need the app running. Check list_notes first so you do not repeat open notes.') + ' ' + EXPLORE_RULE

function textResult(value, isError = false) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return { content: [{ type: 'text', text }], ...(isError ? { isError: true } : {}) }
}

async function handle(message) {
  switch (message.method) {
    case 'initialize': {
      const requested = message.params?.protocolVersion
      return {
        protocolVersion: SUPPORTED_PROTOCOLS.includes(requested) ? requested : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'openwriter', title: 'OpenWriter', version: SERVER_VERSION },
        instructions: INSTRUCTIONS,
      }
    }
    case 'ping':
      return {}
    case 'tools/list':
      return { tools: ACTIVE_TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: !WRITE_TOOLS.some((tool) => tool.name === name), destructiveHint: false, idempotentHint: !WRITE_TOOLS.some((tool) => tool.name === name), openWorldHint: false } })) }
    case 'tools/call': {
      const tool = ACTIVE_TOOLS.find((item) => item.name === message.params?.name)
      if (!tool) throw Object.assign(new Error(`Unknown tool: ${message.params?.name}`), { code: -32602 })
      try {
        return textResult(await tool.run(message.params?.arguments || {}))
      } catch (error) {
        // Un errore dello strumento (progetto non trovato, file inesistente…) torna come risultato, così l'agente può leggerlo e correggersi.
        return textResult(error.message || String(error), true)
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${message.method}`), { code: -32601 })
  }
}

const send = (payload) => process.stdout.write(`${JSON.stringify(payload)}\n`)

const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
let inFlight = 0
let closed = false
const finishIfIdle = () => { if (closed && inFlight === 0) process.exit(0) }
lines.on('line', async (line) => {
  if (!line.trim()) return
  let message
  try { message = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return }
  // Le notifiche (nessun id: es. notifications/initialized) non hanno risposta.
  if (message.id === undefined || message.id === null) return
  inFlight += 1
  try {
    send({ jsonrpc: '2.0', id: message.id, result: await handle(message) })
  } catch (error) {
    send({ jsonrpc: '2.0', id: message.id, error: { code: error.code || -32603, message: error.message || 'Internal error' } })
  } finally {
    inFlight -= 1
    finishIfIdle()
  }
})
// Il client chiude stdin quando ha finito: il processo termina dopo aver risposto alle richieste ancora in corso.
lines.on('close', () => { closed = true; finishIfIdle() })
process.on('uncaughtException', (error) => log('uncaught:', error.stack || error.message))
log(`started (data: ${dataDirectory})`)
