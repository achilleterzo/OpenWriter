#!/usr/bin/env node
/**
 * Server MCP di OpenWriter (stdio, sola lettura).
 *
 * Mette a disposizione degli agenti esterni (Claude Code, Codex, OpenCode, client integrati negli IDE…) ciò che i soli file non mostrano:
 * contesto e istruzioni del progetto, skill, note, segnalibri, memoria, oltre a elenco, lettura e ricerca dei documenti.
 * Non scrive nulla: le modifiche restano del client dell'agente. Non dipende da Electron, quindi funziona anche con l'app chiusa.
 *
 * Il progetto è, in ordine: `--project <cartella>` (o OPENWRITER_PROJECT); la `.ow` più vicina risalendo dalla cartella in cui parte l'agente;
 * il progetto aperto nell'app (workspace.json nei dati dell'app, riletto a ogni chiamata). `--data <cartella>` indica i dati dell'app.
 *
 * Protocollo: JSON-RPC 2.0 con un messaggio per riga su stdin/stdout. Su stdout passano solo messaggi del protocollo; i diagnostici vanno su stderr.
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const readline = require('node:readline')
const { createProjectFile } = require('./project-file.cjs')
const { createNotesStore } = require('./notes-store.cjs')
const { createBookmarksStore } = require('./bookmarks-store.cjs')
const { createMemoryStore } = require('./memory-store.cjs')
const { createSkillsStore } = require('./skills-store.cjs')
const { createProjectTools } = require('./project-tools.cjs')
const { findOwners } = require('./project-owner.cjs')

const SERVER_VERSION = '1.0.0'
const SUPPORTED_PROTOCOLS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']
const SEARCH_EXTENSIONS = /\.(md|markdown|mdown|txt)$/i
const SKIPPED_NAMES = new Set(['.ow', '.git', 'node_modules'])
const MAX_SEARCH_RESULTS = 50
const MAX_SEARCH_FILE_BYTES = 2 * 1024 * 1024

const log = (...parts) => process.stderr.write(`[openwriter-mcp] ${parts.join(' ')}\n`)

function parseArguments(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    if (flag === '--project' || flag === '--data') result[flag.slice(2)] = argv[(index += 1)]
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
const projectTools = createProjectTools({ getProjectPath: projectPath, readDocument })

const posix = (value) => value.split(path.sep).join('/')

// Percorso di un documento dato dall'agente (relativo al progetto o assoluto) → assoluto, mai fuori dal progetto né dentro `.ow`.
function documentPath(value) {
  const project = projectPath()
  const target = path.resolve(project, String(value || ''))
  const relative = path.relative(project, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('The path is outside the project')
  if (relative.split(path.sep).some((part) => SKIPPED_NAMES.has(part))) throw new Error('This path is not accessible')
  return target
}

const relativeTo = (project, target) => posix(path.relative(project, target)) || '.'

function contextChain(document) {
  return projectFile.getContextChain(document ? documentPath(document) : null)
}

const TOOLS = [
  {
    name: 'project_info',
    description: 'Describes the OpenWriter project this server is reading: folder, how it was chosen, name, sub-projects, languages and active skills. Call it first to know where you are.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run() {
      const { path: project, source } = resolveProject()
      const settings = projectFile.getSettings()
      return {
        project,
        chosenFrom: source,
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
    inputSchema: { type: 'object', properties: { document: { type: 'string', description: 'optional: document path relative to the project root' } }, additionalProperties: false },
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
    inputSchema: { type: 'object', properties: { document: { type: 'string', description: 'optional: document path relative to the project root' } }, additionalProperties: false },
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
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, document: { type: 'string', description: 'optional: document path relative to the project root' } }, required: ['id'], additionalProperties: false },
    run({ id, document }) {
      const chain = contextChain(document)
      const { skills } = skillsStore.list(chain.map((entry) => ({ base: entry.base, name: entry.name })))
      const found = skills.find((skill) => skill.id === id && !skill.shadowed)
      if (!found) throw new Error(`Skill not found: ${id}`)
      const skill = skillsStore.get({ scope: found.scope, base: found.base, id })
      return { id, scope: skill.scope, owner: found.owner || '', markdown: skill.markdown }
    },
  },
  {
    name: 'list_documents',
    description: 'Lists a folder of the project (default: the root), folders first. Entries carry size and last-modified time; folders that are sub-projects are flagged.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'folder relative to the project root (default ".")' }, sort: { type: 'string', enum: ['name', 'date'], description: '"date" lists the most recently modified first' } }, additionalProperties: false },
    run: ({ path: folder, sort }) => projectTools.listDirectory(folder || '.', { sort: sort === 'date' ? 'date' : 'name' }),
  },
  {
    name: 'read_document',
    description: 'Reads a project document as text (.md, .txt, .docx). Long ones come in chunks: use `offset` with the `nextOffset` of the previous answer. It returns what is saved on disk: edits still being reviewed in OpenWriter are not included.',
    inputSchema: { type: 'object', properties: { path: { type: 'string', description: 'document path relative to the project root' }, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, description: 'maximum characters (default 20000, max 40000)' } }, required: ['path'], additionalProperties: false },
    run: ({ path: file, offset, limit }) => projectTools.readFile(file, { offset, limit }),
  },
  {
    name: 'search_documents',
    description: 'Case-insensitive text search in the project Markdown and text files (sub-projects included). Returns file, line number and the line.',
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, path: { type: 'string', description: 'optional: limit to a folder relative to the project root' }, maxResults: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_RESULTS } }, required: ['query'], additionalProperties: false },
    run({ query, path: folder, maxResults }) {
      const needle = String(query || '').toLowerCase()
      if (!needle.trim()) throw new Error('The query is empty')
      const project = projectPath()
      const start = folder ? documentPath(folder) : project
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
    inputSchema: { type: 'object', properties: { document: { type: 'string', description: 'optional: document path relative to the project root' }, status: { type: 'string', enum: ['open', 'accepted', 'rejected', 'resolved', 'all'], description: 'default "open"' } }, additionalProperties: false },
    run({ document, status }) {
      const wanted = status || 'open'
      const pick = (notes) => notes.filter((note) => wanted === 'all' || note.status === wanted).map((note) => ({ id: note.id, kind: note.kind, status: note.status, author: note.author, quote: note.quote, body: note.body, ...(note.replacement !== null && note.replacement !== undefined ? { replacement: note.replacement } : {}), ...(note.resolution ? { resolution: note.resolution } : {}), createdAt: note.createdAt }))
      if (document) return { documents: [{ path: document, notes: pick(notesStore.list(documentPath(document))) }] }
      return { documents: notesStore.listAll().map((entry) => ({ path: entry.path, notes: pick(entry.notes) })).filter((entry) => entry.notes.length) }
    },
  },
  {
    name: 'list_bookmarks',
    description: 'Bookmarks: named points of the documents (anchored to a quoted passage). Some are flagged for the assistant\'s attention, with a note saying why. Link form between documents: file.md#bookmark-name. Without `document` it lists all of the project.',
    inputSchema: { type: 'object', properties: { document: { type: 'string', description: 'optional: document path relative to the project root' }, flaggedOnly: { type: 'boolean', description: 'only the bookmarks flagged for the assistant' } }, additionalProperties: false },
    run({ document, flaggedOnly }) {
      const pick = (items) => items.filter((item) => !flaggedOnly || item.flagged).map((item) => ({ name: item.name, label: item.label, quote: item.quote, note: item.note, flagged: item.flagged, author: item.author }))
      if (document) return { documents: [{ path: document, bookmarks: pick(bookmarksStore.list(documentPath(document))) }] }
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

const INSTRUCTIONS = 'Read-only access to an OpenWriter project (a local Markdown workspace): call project_info first, then get_context for the instructions written for the assistant and list_skills / get_skill for the project skills. Notes, bookmarks and memory record the workflow around the documents. This server never edits anything: edit the files with your own tools.'

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
      return { tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema, annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } })) }
    case 'tools/call': {
      const tool = TOOLS.find((item) => item.name === message.params?.name)
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
lines.on('line', async (line) => {
  if (!line.trim()) return
  let message
  try { message = JSON.parse(line) } catch { send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); return }
  // Le notifiche (nessun id: es. notifications/initialized) non hanno risposta.
  if (message.id === undefined || message.id === null) return
  try {
    send({ jsonrpc: '2.0', id: message.id, result: await handle(message) })
  } catch (error) {
    send({ jsonrpc: '2.0', id: message.id, error: { code: error.code || -32603, message: error.message || 'Internal error' } })
  }
})
// Il client chiude stdin quando ha finito: il processo termina.
lines.on('close', () => process.exit(0))
process.on('uncaughtException', (error) => log('uncaught:', error.stack || error.message))
log(`started (data: ${dataDirectory})`)
