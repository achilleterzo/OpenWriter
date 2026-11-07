const { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, safeStorage, screen, session, shell, webContents } = require('electron')
const { pathToFileURL } = require('node:url')
const { Worker } = require('node:worker_threads')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const mammoth = require('mammoth')
const { createApplicationMenu } = require('./menu.cjs')
const { createAiProviders } = require('./ai-providers.cjs')
const { createProjectFile } = require('./project-file.cjs')
const { cleanTemperature } = require('./temperature.cjs')
const { createProjectsStore } = require('./projects.cjs')
const { execFile } = require('node:child_process')
const { createSystemIntegration } = require('./system-integration.cjs')
const { createChatStore } = require('./chat-store.cjs')
const { createMemoryStore } = require('./memory-store.cjs')
const { createMcpBridge } = require('./mcp-bridge.cjs')
const { createMcpHttp } = require('./mcp-http.cjs')
const { formatSearch } = require('./project-search.cjs')
const { isSameOrInside, samePath } = require('./path-compare.cjs')
const { fetchLatestRelease } = require('./updates.cjs')
const { createProjectTools } = require('./project-tools.cjs')
const { createNotesStore } = require('./notes-store.cjs')
const projectIcon = require('./project-icon.cjs')
const { planImageMove, applyImageMove } = require('./document-images.cjs')
const { findImages, rewriteImageDestinations } = require('./markdown-images.cjs')
const { writeFileAtomic } = require('./atomic-write.cjs')
const { createFontsStore } = require('./fonts.cjs')
const { parsePdf, MARKER } = require('./pdf-import.cjs')
const { createBrowserHistory } = require('./browser-history.cjs')
const { createReferencesStore } = require('./project-references.cjs')
const { createWebReferencesStore, webFolderOf } = require('./web-references.cjs')
const projectPack = require('./project-pack.cjs')
const { createBookmarksStore } = require('./bookmarks-store.cjs')
const { embedImages } = require('./markdown-embed.cjs')
const { extractImages } = require('./markdown-extract.cjs')
const fileClipboard = require('./file-clipboard.cjs')
const { createLinksStore, checkedPaths, writeLinksTo } = require('./project-links.cjs')
const { createSkillsStore, skillFromMarkdown, MAX_SKILL_CHARS } = require('./skills-store.cjs')
const { createKnowledgeService, formatKnowledgeResults } = require('./knowledge-service.cjs')
const { createSemanticPack } = require('./semantic-pack.cjs')
const { createGpuContext } = require('./gpu-context.cjs')
const { outsideFolders: outsideFoldersOf } = require('./shared-knowledge.cjs')
const { STOPWORDS } = require('./knowledge-index.cjs')
const { affinityEdges, uniformEdges, collectVectors, parentProjects } = require('./project-graph.cjs')
const { mergeSearches, cleanTerms } = require('./search-merge.cjs')
// Un carattere UTF-8 occupa al massimo 4 byte: oltre, il file supera di sicuro il limite delle skill.
const MAX_SKILL_FILE_BYTES = MAX_SKILL_CHARS * 4
const images = require('./images.cjs')
const { t, setLocale, getLocale } = require('./i18n.cjs')

const isDevelopment = !app.isPackaged
let mainWindow

// Errori e avvisi del processo principale (anche quelli che Electron stampa per un comando IPC fallito): oltre che nel terminale, arrivano alla finestra come
// notifiche (canale `app:notice`, vedi src/lib/toasts.js). Un errore di un comando diventa "motivo" + comando nel dettaglio.
const NOTICE_IGNORED = [/^\(node:\d+\)/, /ExperimentalWarning|DeprecationWarning/, /Electron Security Warning/i, /Autofill\./, /Request Autofill/]
let forwarding = false
function forwardNotice(level, args) {
  if (forwarding || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  forwarding = true
  try {
    const lines = require('node:util').format(...args).split('\n').map((line) => line.trim()).filter(Boolean)
    if (!lines.length || NOTICE_IGNORED.some((pattern) => pattern.test(lines[0]))) return
    const handler = /^Error occurred in handler for '([^']+)':\s*(?:Error:\s*)?(.*)$/.exec(lines[0])
    const message = (handler ? handler[2] || lines[0] : lines[0]).slice(0, 300)
    const detail = [handler ? `(${handler[1]})` : '', ...lines.slice(1, 7)].filter(Boolean).join('\n')
    mainWindow.webContents.send('app:notice', { level, message, detail })
  } catch { /* le notifiche non devono mai far fallire il resto */ } finally { forwarding = false }
}
for (const [method, level] of [['error', 'error'], ['warn', 'warning']]) {
  const original = console[method].bind(console)
  console[method] = (...args) => { original(...args); forwardNotice(level, args) }
}
// Solo osservare (non cambia il comportamento di Electron davanti a un errore non gestito).
process.on('uncaughtExceptionMonitor', (error) => { forwardNotice('error', [error?.message || String(error)]) })
// Le immagini dei documenti (percorsi relativi al documento) si mostrano tramite ow-file://: solo file immagine, in sola lettura.
protocol.registerSchemesAsPrivileged([{ scheme: 'ow-file', privileges: { standard: true, secure: true } }])
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']

let projectPath = null
const projectsStore = createProjectsStore({ filePath: () => path.join(app.getPath('userData'), 'projects.json') })
// Progetto "main": una cartella con la sua `.ow` nei dati dell'app. Quando nessun progetto è aperto fa da progetto (chat, note, memoria,
// contesto, skill) e tiene sempre cronologia e note dei documenti sparsi, cioè fuori dal progetto aperto.
const mainDirectory = () => path.join(app.getPath('userData'), 'main')
const storePath = () => projectPath || mainDirectory()
const projectFile = createProjectFile({ getProjectPath: storePath, getMainPath: mainDirectory })
const chatStore = createChatStore({ getProjectPath: storePath })
const memoryStore = createMemoryStore({ getProjectPath: storePath })
// Cronologia del browser integrato: una per progetto (senza progetto aperto, quella del progetto main).
const browserHistory = createBrowserHistory({ getProjectPath: storePath })
// Quella delle pagine visitate dall'assistente: a parte, non si mischia con la cronologia dell'utente.
const agentBrowserHistory = createBrowserHistory({ getProjectPath: storePath, fileName: 'browser-history-agent.json' })
const historyFor = (agent) => (agent ? agentBrowserHistory : browserHistory)
const notesStore = createNotesStore({ getProjectPath: storePath, getMainPath: mainDirectory })
// Segnalibri: ancore con nome nei documenti (link `file#nome`, punti da far notare all'assistente).
const bookmarksStore = createBookmarksStore({ getProjectPath: storePath, getMainPath: mainDirectory })
// Documenti esterni collegati al progetto aperto (senza copiarli).
const linksStore = createLinksStore({ getProjectPath: () => projectPath })
// Cartelle di riferimento (fuori dal progetto, solo lettura per l'assistente).
const referencesStore = createReferencesStore({ getProjectPath: () => projectPath })
const webStore = createWebReferencesStore({ getProjectPath: () => projectPath })
const skillsStore = createSkillsStore({ getGlobalDirectory: () => path.join(app.getPath('userData'), 'skills') })
const projectTools = createProjectTools({ getProjectPath: () => projectPath, readDocument: (filePath) => readDocument(filePath) })
const aiRequests = new Map()
const BROWSER_PARTITION = 'persist:openwriter-browser'
const aiProviders = createAiProviders({
  app,
  safeStorage,
  getWorkingDirectory: () => projectPath || undefined,
  getProjectTemperature: () => projectFile.getTemperature(),
  })

const markdownFilter = {
  name: 'Markdown',
  extensions: ['md', 'markdown', 'mdown'],
}

// Una funzione, non una costante: il nome si traduce nella lingua corrente anche dopo un cambio di lingua.
const supportedDocumentsFilter = () => ({
  name: t('All supported files'),
  extensions: ['md', 'markdown', 'mdown', 'docx', 'pdf'],
})

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function textToHtml(text) {
  return text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll('\n', '<br>')}</p>`)
    .join('')
}

const documentExtensions = ['.md', '.markdown', '.mdown', '.docx', '.pdf']
// Quel che l'albero dei file mostra: i documenti e le immagini (che si aprono in una scheda di visualizzazione).
const listedExtensions = [...documentExtensions, ...IMAGE_EXTENSIONS]
const hiddenDirectories = new Set(['node_modules', 'dist', 'out'])

// I pacchetti della ricerca per significato (semantic-pack.cjs): non sono nell'installer, si scaricano quando l'utente lo chiede (Impostazioni → Modelli locali) e
// vivono nei dati dell'app. Ce n'è uno per dispositivo: 'cpu' (modello a 8 bit, WebAssembly in un thread di Node, circa 150 MB) e 'gpu' (modello fp16 su WebGPU
// in una finestra nascosta, circa 280 MB). I vettori di ciascuno stanno a parte nell'indice, quindi passare dall'uno all'altro calcola solo ciò che manca.
function packageRoot(name) {
  let directory = path.dirname(require.resolve(name))
  while (!(fsSync.existsSync(path.join(directory, 'package.json')) && JSON.parse(fsSync.readFileSync(path.join(directory, 'package.json'), 'utf8')).name === name)) {
    const parent = path.dirname(directory)
    if (parent === directory) throw new Error(`Package ${name} not found`)
    directory = parent
  }
  return directory
}
const semanticDirectory = path.join(app.getPath('userData'), 'semantic')
const semanticFetch = (url, init) => net.fetch(url, init)
const semanticPacks = {
  cpu: createSemanticPack({ directory: semanticDirectory, kind: 'cpu', fetchImpl: semanticFetch, commonSource: packageRoot('onnxruntime-common') }),
  gpu: createSemanticPack({ directory: semanticDirectory, kind: 'gpu', fetchImpl: semanticFetch }),
}
// Il contesto WebGPU (gpu-context.cjs): una finestra nascosta che nasce alla prima richiesta. Il tokenizzatore lo serve dai file dell'app.
const gpuContext = createGpuContext({
  BrowserWindow,
  ipcMain,
  packDirectory: () => semanticPacks.gpu.directory,
  tokenizersFile: () => path.join(__dirname, '..', 'node_modules', '@huggingface', 'tokenizers', 'dist', 'tokenizers.mjs'),
})
// Ultima descrizione della scheda video (probe) e ultimo guasto della GPU in questa sessione: con un guasto si ripiega sulla CPU finché l'utente non riprova.
let gpuInfo = null
let gpuFailure = null

// Indice di ricerca per rilevanza (knowledge-index.cjs): derivato dai file, in un thread a parte. Un errore qui non deve mai impedire di lavorare.
const knowledge = createKnowledgeService({
  file: path.join(app.getPath('userData'), 'knowledge.db'),
  hiddenDirectories: [...hiddenDirectories],
  createWorker: (workerData) => new Worker(path.join(__dirname, 'knowledge-worker.cjs'), { workerData }),
  gpuEmbed: (texts, kind) => gpuContext.embed(texts, kind),
  gpuRelease: () => gpuContext.release(),
  onSemanticError: (event) => {
    console.error(`Ricerca per significato (${event.device}):`, event.error)
    // La scheda video non risponde o non regge il modello: si torna alla CPU (i suoi vettori sono già nell'indice) e l'interfaccia dice perché.
    if (event.device === 'gpu') { gpuFailure = event.error; configureSemantic() }
  },
})
// L'indice è attivo per il progetto aperto salvo che le sue impostazioni lo spengano (options.searchIndex); la ricerca per significato solo se il
// modello è installato e abilitato in Impostazioni → Modelli locali. Il progetto non sceglie: se non vuole entrarci spegne l'indice.
let knowledgeOn = true
// Modelli locali (Impostazioni): l'utente può spegnere il modello per tutti i progetti, anche se installato, e scegliere il dispositivo.
const EMBEDDINGS_PREFERENCE = 'openwriter.localModels.embeddings'
const DEVICE_PREFERENCE = 'openwriter.localModels.device'
const semanticAllowed = () => loadPreferences()[EMBEDDINGS_PREFERENCE] !== 'off'
const wantedDevice = () => (loadPreferences()[DEVICE_PREFERENCE] === 'gpu' ? 'gpu' : 'cpu')
// Il dispositivo che calcola davvero: la GPU se scelta, installata e senza guasti; altrimenti la CPU se il suo modello c'è; altrimenti nessuno.
function activeDevice() {
  if (wantedDevice() === 'gpu' && semanticPacks.gpu.ready && !gpuFailure) return 'gpu'
  return semanticPacks.cpu.ready ? 'cpu' : null
}
// La ricerca per significato non dipende dal progetto aperto: ogni progetto con l'indice acceso ha i suoi vettori e la ricerca li usa tutti. `semanticAvailable`:
// c'è un modello installato e abilitato, quindi ogni ricerca può essere per parole e per significato.
const semanticAvailable = () => Boolean(semanticAllowed() && activeDevice())
// I testi da vettorizzare: il progetto aperto, le sue cartelle di riferimento, le pagine web salvate e gli altri progetti che condividono la conoscenza (con l'indice acceso).
// Anche tutti gli altri progetti dell'elenco con l'indice acceso, aperti o no, condividano o no: la ricerca della Home è dell'utente e li cerca tutti.
const semanticTargets = () => {
  if (!semanticAvailable()) return []
  const open = projectPath && knowledgeOn ? [projectPath, ...outsideFolders().map((item) => item.path)] : []
  return [...open, ...indexedProjects()]
}
// `purge`: identificativi dei modelli di cui buttare i vettori (si è tolto il loro pacchetto).
// L'ultimo elenco di progetti configurato per i vettori: se ne cambia uno (un progetto aggiunto, che condivide da poco…) si riconfigura.
let semanticSignature = ''
function configureSemantic({ purge = [] } = {}) {
  if (!knowledge.available) return Promise.resolve(false)
  const projects = semanticTargets()
  semanticSignature = projects.map((item) => knowledge.key(item)).sort().join('|')
  const device = projects.length ? activeDevice() : null
  return knowledge.semanticConfigure({ device, model: device ? semanticPacks[device].id : '', directory: device === 'cpu' ? semanticPacks.cpu.directory : null, projects, purge })
    .catch((error) => { console.error('Ricerca per significato non configurata:', error.message); return false })
}
// I progetti dell'elenco (esistenti) con l'indice di ricerca acceso, aperti o no.
function indexedProjects() {
  try {
    return projectsStore.list().filter((item) => !item.missing && item.path).filter((item) => {
      try { return createProjectFile({ getProjectPath: () => item.path }).searchIndexEnabled() } catch { return false }
    }).map((item) => item.path)
  } catch { return [] }
}
// Riallinea l'indice di questi progetti ai loro file, senza aprirli: legge solo i file nuovi o cambiati. Non più spesso di `every` ms per progetto, salvo `force`.
// → quanti se ne sono avviati.
function syncProjects(directories, { force = false, every = 600000 } = {}) {
  if (!knowledge.available) return 0
  let started = 0
  for (const directory of directories) {
    const key = knowledge.key(directory)
    if (!force && Date.now() - (sharedSynced.get(key) || 0) < every) continue
    sharedSynced.set(key, Date.now())
    started += 1
    knowledge.sync(directory).catch((error) => console.error('Indice di ricerca non aggiornato:', error.message))
  }
  return started
}
function startKnowledge() {
  if (!projectPath) return
  try { knowledgeOn = projectFile.searchIndexEnabled() } catch { knowledgeOn = true }
  if (!knowledgeOn) { configureSemantic(); return }
  knowledge.sync(projectPath).catch((error) => console.error('Indice di ricerca non aggiornato:', error.message))
  // Le cartelle di riferimento del progetto (collegate dall'utente, quindi con il suo consenso) si indicizzano a parte: una sola volta anche se più progetti le usano.
  for (const reference of referenceFolders()) knowledge.sync(reference.path).catch((error) => console.error('Indice di ricerca non aggiornato:', error.message))
  // Gli altri progetti che condividono la loro conoscenza: si riallineano all'apertura (non più spesso di ogni due minuti), senza sorvegliarli.
  for (const other of outsideFolders().filter((item) => item.project || (item.web && item.name !== 'web'))) {
    const key = knowledge.key(other.path)
    if (Date.now() - (sharedSynced.get(key) || 0) < 120000) continue
    sharedSynced.set(key, Date.now())
    knowledge.sync(other.path).catch((error) => console.error('Indice di ricerca non aggiornato:', error.message))
  }
  // Tutti gli altri progetti dell'elenco, anche mai aperti in questa sessione: si aggiornano in secondo piano (non più spesso di ogni dieci minuti).
  syncProjects(indexedProjects().filter((directory) => !samePath(directory, projectPath)))
  watchReferences()
  configureSemantic()
}
const sharedSynced = new Map()
// Tutto ciò che sta fuori dal progetto e si cerca insieme ad esso (`@sigla/…`, sempre in sola lettura): le cartelle di riferimento, le pagine web salvate (`@web`), gli altri progetti che
// condividono la loro conoscenza (vedi shared-knowledge.cjs; chi ha spento l'indice o la condivisione non c'è) e le loro pagine web (`@nome-web`).
const outsideFolders = () => {
  try {
    return projectPath ? outsideFoldersOf({ current: projectPath, references: referencesStore.list(), projects: projectsStore.list(), isShared: (directory) => createProjectFile({ getProjectPath: () => directory }).sharedKnowledgeEnabled(), webFolderOf }) : []
  } catch { return [] }
}
// Le cartelle di riferimento collegate e le pagine web salvate del progetto (`.ow/web`, automatica: `@web`).
const referenceFolders = () => {
  try {
    if (!projectPath) return []
    const list = referencesStore.list().filter((item) => !item.missing)
    const web = webFolderOf(projectPath)
    return web && !list.some((item) => item.name.toLowerCase() === 'web') ? [...list, { name: 'web', path: web, web: true }] : list
  } catch { return [] }
}
// Chi cambia una cartella di riferimento (di solito un altro programma) la tiene aggiornata nell'indice, come per il progetto.
let referenceWatchers = []
function stopReferenceWatch() {
  for (const watcher of referenceWatchers) { try { watcher.close() } catch { /* già chiuso */ } }
  referenceWatchers = []
}
function watchReferences() {
  stopReferenceWatch()
  if (!knowledgeOn) return
  for (const reference of referenceFolders()) {
    try {
      const watcher = fsSync.watch(reference.path, { recursive: true }, (_event, name) => {
        const parts = name ? String(name).split(/[\\/]/) : []
        if (parts.some((part) => CLIPBOARD_IGNORED.has(part))) return
        knowledge.changed(reference.path, name ? [parts.join('/')] : null)
      })
      watcher.on('error', () => { try { watcher.close() } catch { /* già chiuso */ } })
      referenceWatchers.push(watcher)
    } catch { /* senza sorveglianza resta la scansione all'apertura del progetto */ }
  }
}

async function readDocument(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const buffer = await fs.readFile(filePath)

  if (extension === '.docx') {
    const document = await mammoth.convertToHtml({ buffer }, {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        ...Array.from({ length: 7 }, (_, index) => `p[style-name='Heading ${index + 1}'] => h${index + 1}:fresh`),
      ],
    })
    return { filePath, content: document.value, contentType: 'html', format: 'docx' }
  }

  if (extension === '.pdf') {
    const { text, images } = await parsePdf(buffer)
    // Ogni immagine torna dove stava nella pagina, incorporata (data:): al salvataggio diventa un file in images/ (vedi externalizeImages).
    let html = textToHtml(text)
    images.forEach((image, index) => {
      html = html.replace(`<p>${MARKER(index)}</p>`, `<img src="data:${image.mime};base64,${image.data.toString('base64')}" alt="">`)
    })
    return { filePath, content: html.replace(/\u0001IMG\d+\u0001/g, ''), contentType: 'html', format: 'pdf' }
  }

  return { filePath, content: buffer.toString('utf8'), contentType: 'markdown', format: 'markdown' }
}

async function openDocument() {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: projectPath || undefined,
    properties: ['openFile'],
    filters: [supportedDocumentsFilter(), markdownFilter, { name: 'Word', extensions: ['docx'] }, { name: 'PDF', extensions: ['pdf'] }],
  })

  if (result.canceled) return null
  return readDocument(result.filePaths[0])
}

function sessionsFilePath() {
  return path.join(app.getPath('userData'), 'sessions.json')
}

function readSessions() {
  try { return JSON.parse(fsSync.readFileSync(sessionsFilePath(), 'utf8')) } catch { return {} }
}

// Una sessione (schede aperte, bozze, vista laterale) per ogni progetto; senza progetto usa la chiave '__none__'.
const sessionKey = () => projectPath || '__none__'

// Un progetto è stato spostato: la sua sessione (e i percorsi delle schede aperte in qualunque sessione) seguono la nuova posizione.
function moveSessions(from, to) {
  const root = path.resolve(from)
  const rebase = (value) => {
    if (typeof value !== 'string' || value.length > 1000 || /[\r\n]/.test(value) || !path.isAbsolute(value)) return value
    const relative = path.relative(root, value)
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative)) ? path.join(to, relative) : value
  }
  const walk = (value) => {
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, inner]) => [rebase(key), walk(inner)]))
    return rebase(value)
  }
  const sessions = readSessions()
  if (!Object.keys(sessions).length) return
  writeFileAtomic(sessionsFilePath(), JSON.stringify(walk(sessions), null, 2))
}

// Diario degli arresti (crash.log nei dati dell'app): quando la finestra resta vuota senza nulla in console, qui si legge perché.
function logCrash(message) {
  try { fsSync.appendFileSync(path.join(app.getPath('userData'), 'crash.log'), `${new Date().toISOString()} ${message}\n`) } catch { /* il diario non deve mai creare problemi */ }
}

app.on('child-process-gone', (_event, details) => logCrash(`processo ${details.type} terminato: ${details.reason} (codice ${details.exitCode})`))

// Segno "avvio in corso": messo quando la sessione viene letta, tolto al primo salvataggio (l'interfaccia è partita). Se alla lettura successiva c'è ancora,
// l'avvio precedente non è arrivato in fondo: si riparte senza le bozze enormi (immagini incorporate), che finiscono in recovered-drafts/ invece di andare perse.
const startupMarkerPath = () => path.join(app.getPath('userData'), 'startup-pending')
const HEAVY_DRAFT_CHARS = 2_000_000

function setAsideHeavyDrafts(session) {
  const kept = []
  for (const tab of session.tabs || []) {
    if (typeof tab.markdown === 'string' && tab.markdown.length > HEAVY_DRAFT_CHARS) {
      const directory = path.join(app.getPath('userData'), 'recovered-drafts')
      fsSync.mkdirSync(directory, { recursive: true })
      const name = String(tab.title || 'draft').replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim() || 'draft'
      const file = path.join(directory, `${name} (${new Date().toISOString().replace(/[:.]/g, '-')}).md`)
      fsSync.writeFileSync(file, tab.markdown, 'utf8')
      logCrash(`avvio interrotto: la bozza "${tab.title}" (${tab.markdown.length} caratteri) non è stata riaperta, salvata in ${file}`)
      continue
    }
    kept.push(tab)
  }
  if (kept.length === (session.tabs || []).length) return session
  return { ...session, tabs: kept, activeId: kept.some((tab) => tab.id === session.activeId) ? session.activeId : kept[0]?.id }
}

function loadSession({ startup = false } = {}) {
  const session = readSessions()[sessionKey()] || null
  if (!startup) return session
  let interrupted = false
  try {
    interrupted = fsSync.existsSync(startupMarkerPath())
    fsSync.writeFileSync(startupMarkerPath(), String(Date.now()))
  } catch { /* senza segno si riparte normalmente */ }
  if (!interrupted || !session) return session
  try { return setAsideHeavyDrafts(session) } catch (error) { logCrash(`bozze non messe da parte: ${error.message}`); return session }
}

function saveSession(session) {
  try { fsSync.rmSync(startupMarkerPath(), { force: true }) } catch { /* innocuo */ }
  const sessions = readSessions()
  sessions[sessionKey()] = session
  fsSync.mkdirSync(app.getPath('userData'), { recursive: true })
  // Scrittura atomica: con bozze grandi (immagini incorporate) un arresto a metà lascerebbe il file troncato e, alla riapertura, tutte le sessioni perse.
  writeFileAtomic(sessionsFilePath(), JSON.stringify(sessions))
  return true
}

// Riapre un documento della sessione, anche fuori dalla cartella del progetto, ma solo se era davvero in sessione.
function readSessionDocument(filePath) {
  const known = (loadSession()?.tabs || []).some((tab) => tab.sourcePath === filePath)
  return readDocument(known ? path.resolve(filePath) : resolveInProject(filePath))
}

function workspaceFilePath() {
  return path.join(app.getPath('userData'), 'workspace.json')
}

async function loadProject() {
  try {
    const { project } = JSON.parse(await fs.readFile(workspaceFilePath(), 'utf8'))
    if (project && (await fs.stat(project)).isDirectory()) projectPath = project
  } catch {}
  initializeProject()
  // Il progetto di un avvio precedente entra nell'elenco anche se è stato aperto prima che l'elenco esistesse.
  if (projectPath && !projectsStore.list().some((item) => samePath(item.path, projectPath))) projectsStore.touch(projectPath)
}

// Prepara la cartella .ow all'apertura del progetto; un errore (es. cartella in sola lettura) non deve impedire di lavorare.
function initializeProject() {
  try { projectFile.initialize() } catch (error) { console.error('Inizializzazione .ow non riuscita:', error.message) }
  // Il progetto main esiste sempre, anche con un progetto aperto: ci vivono i documenti sparsi.
  if (projectPath) {
    try { createProjectFile({ getProjectPath: mainDirectory }).initialize() } catch (error) { console.error('Inizializzazione .ow del progetto main non riuscita:', error.message) }
  }
  startKnowledge()
}

async function setProject(directory) {
  projectPath = directory
  initializeProject()
  await fs.mkdir(app.getPath('userData'), { recursive: true })
  await fs.writeFile(workspaceFilePath(), JSON.stringify({ project: projectPath }, null, 2))
  projectsStore.touch(projectPath)
  applySpellcheck()
  return projectPath
}

// Le operazioni del file explorer sono limitate alla cartella del progetto corrente.
function resolveInProject(target) {
  if (!projectPath) throw new Error(t('No project open'))
  const resolved = path.resolve(target)
  const relative = path.relative(projectPath, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(t('Path is outside the project'))
  return resolved
}

// Primo nome libero in `directory`: "file.md" → "file (1).md" → "file (2).md" …
async function uniqueDestination(directory, fileName) {
  const { name, ext } = path.parse(fileName)
  for (let index = 0; ; index += 1) {
    const candidate = path.join(directory, index === 0 ? fileName : `${name} (${index})${ext}`)
    try { await fs.access(candidate) } catch { return candidate }
  }
}

async function importFiles({ paths, targetDirectory }) {
  const directory = resolveInProject(targetDirectory)
  if (!(await fs.stat(directory)).isDirectory()) throw new Error(t('The destination is not a folder'))
  const copied = []
  const skipped = []
  for (const source of Array.isArray(paths) ? paths : []) {
    try {
      const stats = await fs.stat(source)
      // Una cartella arriva con tutto il suo contenuto (come con "incolla"), tranne .ow, .git e node_modules; mai dentro se stessa.
      if (stats.isDirectory()) {
        if (CLIPBOARD_IGNORED.has(path.basename(source)) || isSameOrInside(source, directory)) { skipped.push(source); continue }
        const destination = await uniqueDestination(directory, path.basename(source))
        await fs.cp(source, destination, { recursive: true, errorOnExist: true, filter: (item) => !CLIPBOARD_IGNORED.has(path.basename(item)) })
        copied.push(destination)
        continue
      }
      if (!stats.isFile() || !listedExtensions.includes(path.extname(source).toLowerCase())) { skipped.push(source); continue }
      const destination = await uniqueDestination(directory, path.basename(source))
      await fs.copyFile(source, destination, fsSync.constants.COPYFILE_EXCL)
      copied.push(destination)
    } catch {
      skipped.push(source)
    }
  }
  return { copied, skipped }
}

// Dove cercare chi usa ancora un'immagine quando un documento si sposta: tutto il progetto e i documenti collegati (vedi document-images.cjs).
function imageScanOptions() {
  let extraDocuments = []
  try { extraDocuments = linksStore.list().map((link) => link.path) } catch { /* senza progetto: solo la cartella del documento */ }
  return { scanRoot: projectPath, extraDocuments }
}

async function renamePath({ path: target, newName }) {
  const source = resolveInProject(target)
  if (source === projectPath) throw new Error(t('The project folder cannot be renamed from here'))
  const name = String(newName || '').trim()
  if (!name || name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name)) throw new Error(t('Invalid name'))
  const isDirectory = (await fs.stat(source)).isDirectory()
  // Se l'estensione viene omessa o non è supportata, si conserva quella originale.
  const finalName = isDirectory || listedExtensions.includes(path.extname(name).toLowerCase()) ? name : `${name}${path.extname(source)}`
  const destination = resolveInProject(path.join(path.dirname(source), finalName))
  if (destination === source) return source
  const caseOnlyChange = samePath(destination, source)
  if (!caseOnlyChange && fsSync.existsSync(destination)) throw new Error(t('An item with this name already exists'))
  // Gli originali (DOCX/PDF con lo stesso nome) prendono il nuovo nome insieme al documento Markdown.
  const companions = !isDirectory && path.extname(destination).toLowerCase() === '.md' ? originalsOf(source) : []
  const newStem = path.basename(destination, path.extname(destination))
  const companionTargets = companions.map((item) => path.join(path.dirname(item), `${newStem}${path.extname(item)}`))
  companionTargets.forEach((target, index) => { if (!samePath(target, companions[index]) && fsSync.existsSync(target)) throw new Error(t('An item with this name already exists')) })
  await fs.rename(source, destination)
  for (let index = 0; index < companions.length; index += 1) if (companionTargets[index] !== companions[index]) await moveFile(companions[index], companionTargets[index])
  moveArtifacts(source, destination)
  return destination
}

// Tutto ciò che riguarda un file o una cartella (cronologia, note, memoria) lo segue quando viene rinominato o spostato,
// anche in un altro progetto (sotto-progetto o progetto padre).
function moveArtifacts(source, destination) {
  try { projectFile.moveHistory(source, destination) } catch (error) { console.error('Cronologia non spostata:', error) }
  try { notesStore.move(source, destination) } catch (error) { console.error('Note non spostate:', error) }
  try { bookmarksStore.move(source, destination) } catch (error) { console.error('Segnalibri non spostati:', error) }
  try { memoryStore.relocate(source, destination) } catch (error) { console.error('Memoria non aggiornata:', error) }
}

// Gli originali (DOCX/PDF con lo stesso nome) che l'albero mostra sotto un documento Markdown: lo seguono quando si sposta, si rinomina, si copia o si trascina.
function originalsOf(markdownPath) {
  if (path.extname(markdownPath).toLowerCase() !== '.md') return []
  const directory = path.dirname(markdownPath)
  const stem = path.basename(markdownPath, path.extname(markdownPath)).toLowerCase()
  try {
    return fsSync.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && convertibleExtensions.includes(path.extname(entry.name).toLowerCase()) && path.basename(entry.name, path.extname(entry.name)).toLowerCase() === stem)
      .map((entry) => path.join(directory, entry.name))
  } catch { return [] }
}

async function moveFile(from, to) {
  try {
    await fs.rename(from, to)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    await fs.copyFile(from, to, fsSync.constants.COPYFILE_EXCL)
    await fs.rm(from)
  }
}

// Spostamento col trascinamento nell'explorer: l'elemento va dentro `toDirectory` mantenendo il nome.
async function moveIntoDirectory({ from, toDirectory }) {
  const source = resolveInProject(from)
  const directory = resolveInProject(toDirectory)
  if (source === projectPath) throw new Error(t('The project folder cannot be renamed from here'))
  if (!(await fs.stat(directory).then((stat) => stat.isDirectory(), () => false))) throw new Error(t('The destination is not a folder'))
  if (path.dirname(source) === directory) return source
  if (directory === source || directory.startsWith(source + path.sep)) throw new Error(t('A folder cannot be moved into itself'))
  const destination = path.join(directory, path.basename(source))
  if (fsSync.existsSync(destination)) throw new Error(t('An item with this name already exists'))
  // Le immagini accanto al documento (images/) lo seguono; se nella destinazione ce n'è una diversa con lo stesso nome, lo spostamento non parte.
  const imagePlan = planImageMove(source, destination, imageScanOptions())
  // Gli originali (DOCX/PDF) vanno con il documento: si controlla prima che nella destinazione non ci siano file con lo stesso nome.
  const companions = originalsOf(source)
  const companionTargets = companions.map((item) => path.join(directory, path.basename(item)))
  if (companionTargets.some((item) => fsSync.existsSync(item))) throw new Error(t('An item with this name already exists'))
  await fs.rename(source, destination)
  for (let index = 0; index < companions.length; index += 1) await moveFile(companions[index], companionTargets[index])
  moveArtifacts(source, destination)
  applyImageMove(imagePlan)
  return destination
}

// Conferma nella finestra interna dell'app (la stessa delle altre conferme), non in una finestra di sistema: la domanda va al renderer, che risponde.
const pendingQuestions = new Map()
let questionCounter = 0
function confirmInApp({ message, detail = '', confirmLabel, danger = false }) {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve(false)
  return new Promise((resolve) => {
    questionCounter += 1
    pendingQuestions.set(questionCounter, resolve)
    mainWindow.webContents.send('dialog:ask', { id: questionCounter, message, detail, confirmLabel, danger })
  })
}
ipcMain.on('dialog:answer', (_event, id, answer) => {
  const resolve = pendingQuestions.get(id)
  pendingQuestions.delete(id)
  resolve?.(answer === true)
})

// Elimina uno o più elementi (file o cartelle del progetto) con UNA conferma. Un documento Markdown con il suo originale (DOCX/PDF convertito) se ne va
// insieme all'originale: lasciarlo farebbe riapparire l'originale come file da convertire (e cliccarlo per eliminarlo ricreerebbe il Markdown).
// Un elemento dentro un'altra cartella eliminata se ne va con quella. Risposta: i percorsi eliminati (per ogni elemento, prima lui, poi i suoi originali), o false se l'utente rinuncia.
async function deletePaths(targets) {
  const given = [...new Set((Array.isArray(targets) ? targets : [targets]).map((item) => resolveInProject(item)))]
  if (!given.length) return false
  if (given.some((item) => samePath(item, projectPath))) throw new Error(t('The project folder cannot be deleted from here'))
  const sources = given.filter((item) => !given.some((other) => other !== item && isSameOrInside(other, item)))
  const info = []
  for (const source of sources) {
    const isDirectory = (await fs.stat(source)).isDirectory()
    info.push({ source, isDirectory, originals: isDirectory ? [] : originalsOf(source) })
  }
  const withOriginals = info.filter((item) => item.originals.length)
  const originalsNote = (item) => t('Its original ({names}) will be moved to the trash too.', { names: item.originals.map((original) => path.basename(original)).join(', ') })
  let message
  let detail
  if (info.length === 1) {
    const [only] = info
    message = t('Delete "{basename}"?', { basename: path.basename(only.source) })
    detail = only.isDirectory
      ? t('The folder and all its contents will be moved to the trash.') + (fsSync.existsSync(path.join(only.source, projectFile.directoryName)) ? ` ${t('It is a sub-project: its history, notes and settings go with it.')}` : '')
      : t('The file will be moved to the trash.') + (only.originals.length ? ` ${originalsNote(only)}` : '')
  } else {
    const names = info.slice(0, 8).map((item) => `• ${path.basename(item.source)}${item.isDirectory ? '/' : ''}`)
    if (info.length > 8) names.push(t('And {count} more…', { count: info.length - 8 }))
    message = t('Delete {count} items?', { count: info.length })
    detail = [names.join('\n'), t('They will be moved to the trash.') + (withOriginals.length ? ` ${t('The DOCX/PDF originals of the documents are included.')}` : '')].join('\n\n')
  }
  const confirmed = await confirmInApp({ message, detail, confirmLabel: t('Move to the trash'), danger: true })
  if (!confirmed) return false
  const deleted = []
  const failures = []
  for (const item of info) {
    try {
      await shell.trashItem(item.source)
      deleted.push(item.source)
    } catch (error) {
      failures.push(error.message)
      continue
    }
    // Un originale che non si riesce a cestinare resta dov'è, senza far fallire il resto.
    for (const original of item.originals) {
      try { await shell.trashItem(original); deleted.push(original) } catch (error) { console.error('Originale non cestinato:', original, error.message) }
    }
  }
  if (!deleted.length && failures.length) throw new Error(failures[0])
  return deleted
}
const deletePath = (target) => deletePaths([target])

// Lingue del correttore: quelle del progetto, se impostate, altrimenti quelle generali (spellcheck.json).
function spellcheckFilePath() {
  return path.join(app.getPath('userData'), 'spellcheck.json')
}

function availableSpellLanguages() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents.session.availableSpellCheckerLanguages : []
}

function readGlobalSpellcheck() {
  try {
    const { languages } = JSON.parse(fsSync.readFileSync(spellcheckFilePath(), 'utf8'))
    if (Array.isArray(languages)) return languages.filter((language) => typeof language === 'string')
  } catch {}
  return [...new Set(['it', 'en-US', app.getLocale()])].filter((language) => availableSpellLanguages().includes(language))
}

function effectiveSpellcheck() {
  let projectLanguages = []
  try { if (projectPath) projectLanguages = projectFile.getSettings().spellcheck.languages } catch {}
  const available = availableSpellLanguages()
  return (projectLanguages.length ? projectLanguages : readGlobalSpellcheck()).filter((language) => available.includes(language))
}

function spellcheckState() {
  return { available: availableSpellLanguages(), global: readGlobalSpellcheck(), effective: effectiveSpellcheck() }
}

function applySpellcheck() {
  // Dove il sistema gestisce il correttore (nessun dizionario elencato) non si interviene.
  if (!availableSpellLanguages().length) return
  const { session } = mainWindow.webContents
  const languages = effectiveSpellcheck()
  session.setSpellCheckerEnabled(languages.length > 0)
  if (languages.length) session.setSpellCheckerLanguages(languages)
}

// Il menu contestuale di editor e campi di testo lo disegna il renderer (HTML, stile piatto): qui si inviano i dati del correttore.
function sendEditContextMenu(webContents, params) {
  if (!params.isEditable && !params.selectionText) return
  webContents.send('edit:context-menu', {
    x: params.x,
    y: params.y,
    isEditable: params.isEditable,
    misspelledWord: params.misspelledWord,
    suggestions: params.dictionarySuggestions.slice(0, 5),
    flags: params.editFlags,
  })
}

const convertibleExtensions = ['.docx', '.pdf']

async function listDirectory(directory) {
  const resolved = resolveInProject(directory)
  const entries = await fs.readdir(resolved, { withFileTypes: true })
  // L'albero mostra tutti i file (non nascosti), non solo quelli che si aprono: `openable` dice se OpenWriter può aprirli (documenti e immagini); gli altri
  // compaiono con un punto esclamativo, così una cartella con soli file di codice non sembra vuota.
  const visible = entries.filter((entry) => !entry.name.startsWith('.') && (!entry.isDirectory() || !hiddenDirectories.has(entry.name)))
  // Un DOCX/PDF che ha già il suo Markdown (stesso nome) non sta più in lista: compare sotto il Markdown, come originale in sola lettura.
  const stem = (entry) => path.basename(entry.name, path.extname(entry.name)).toLowerCase()
  const isMarkdown = (entry) => !entry.isDirectory() && path.extname(entry.name).toLowerCase() === '.md'
  const markdownNames = new Set(visible.filter(isMarkdown).map(stem))
  const originalOf = (entry) => !entry.isDirectory() && convertibleExtensions.includes(path.extname(entry.name).toLowerCase()) && markdownNames.has(stem(entry))
  const originals = new Map()
  for (const entry of visible.filter(originalOf)) originals.set(stem(entry), [...(originals.get(stem(entry)) || []), { name: entry.name, path: path.join(directory, entry.name) }])
  // Cosa c'è in una cartella: 'empty' (davvero niente: non si apre), 'hidden' (ci sono solo elementi nascosti: «Solo file nascosti», così non sembra vuota e non la si
  // cancella per errore) oppure null (ha qualcosa da mostrare).
  const emptiness = async (name) => {
    try {
      const inner = await fs.readdir(path.join(resolved, name), { withFileTypes: true })
      if (!inner.length) return 'empty'
      const shows = inner.some((item) => !item.name.startsWith('.') && (!item.isDirectory() || !hiddenDirectories.has(item.name)))
      return shows ? null : 'hidden'
    } catch { return null }
  }
  const shown = visible.filter((entry) => !originalOf(entry))
  const states = new Map(await Promise.all(shown.filter((entry) => entry.isDirectory()).map(async (entry) => [entry.name, await emptiness(entry.name)])))
  return shown
    // Una cartella con una `.ow` propria è un sotto-progetto: l'explorer la distingue dalle altre.
    .map((entry) => ({
      name: entry.name,
      path: path.join(directory, entry.name),
      isDirectory: entry.isDirectory(),
      isProject: entry.isDirectory() && fsSync.existsSync(path.join(resolved, entry.name, projectFile.directoryName)),
      ...(entry.isDirectory() && states.get(entry.name) ? { emptiness: states.get(entry.name) } : {}),
      ...(!entry.isDirectory() ? { openable: listedExtensions.includes(path.extname(entry.name).toLowerCase()) } : {}),
      ...(isMarkdown(entry) && originals.has(stem(entry)) ? { originals: originals.get(stem(entry)) } : {}),
    }))
    .sort((left, right) => Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name, 'it', { sensitivity: 'base' }))
}

// Percorso iniziale di una finestra di scelta: un nome nella cartella del documento (se si conosce) o, altrimenti, in quella del progetto aperto. Senza un percorso
// il sistema riparte dall'ultima cartella usata, che può essere quella di un altro progetto.
function startingPath(name, documentPath) {
  const directory = documentPath && path.isAbsolute(String(documentPath)) ? path.dirname(String(documentPath)) : projectPath || app.getPath('documents')
  return path.join(directory, name)
}

async function chooseSavePath({ filePath, saveAs, filters, defaultPath }) {
  if (filePath && !saveAs) return filePath

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filePath || defaultPath,
    filters,
  })

  return result.canceled ? null : result.filePath
}

// Pagina stampabile del documento: stesso foglio di stile per l'esportazione in PDF e per la stampa.
function printableHtml(html) {
  return `<!doctype html><html><head><meta charset="UTF-8"><style>
    @page { size: A4; margin: 2cm; }
    body { font-family: Arial, sans-serif; color: #111827; line-height: 1.6; font-size: 11pt; }
    h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote, pre, table { margin: 0 0 12px; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; break-after: avoid; }
    h1 { font-size: 22pt; } h2 { font-size: 17pt; } h3 { font-size: 14pt; } h4, h5, h6 { font-size: 12pt; }
    ul { list-style: disc; padding-left: 22px; } ol { list-style: decimal; padding-left: 22px; }
    blockquote { border-left: 3px solid #64748b; padding-left: 12px; color: #475569; }
    pre { padding: 12px; background: #f1f5f9; white-space: pre-wrap; break-inside: avoid; }
    code { font-family: monospace; }
    img { max-width: 100%; height: auto; break-inside: avoid; }
    table { border-collapse: collapse; } th, td { border: 1px solid #cbd5e1; padding: 4px 8px; }
    a { color: #1d4ed8; }
  </style></head><body>${html}</body></html>`
}

async function loadPrintable(html) {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printableHtml(html))}`)
  // Le immagini (anche quelle del progetto, servite da ow-file://) devono essere caricate prima di stampare.
  await printWindow.webContents.executeJavaScript('Promise.all(Array.from(document.images).map((image) => (image.complete ? 1 : new Promise((resolve) => { image.onload = image.onerror = resolve }))))')
  return printWindow
}

async function exportPdf(html, filePath) {
  const printWindow = await loadPrintable(html)
  try {
    const pdf = await printWindow.webContents.printToPDF({ printBackground: true })
    await fs.writeFile(filePath, pdf)
  } finally {
    printWindow.close()
  }
}

// Stampa con la finestra di dialogo del sistema; restituisce true se il lavoro è stato inviato alla stampante.
async function printDocument(html) {
  const printWindow = await loadPrintable(html)
  try {
    return await new Promise((resolve) => { printWindow.webContents.print({ printBackground: true }, (success) => resolve(success)) })
  } finally {
    printWindow.close()
  }
}

const defaultWindowState = { width: 1280, height: 800, maximized: false }

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json')
}

// Ripristina posizione e dimensioni solo se la finestra cade ancora su uno schermo collegato.
function loadWindowState() {
  try {
    const saved = JSON.parse(fsSync.readFileSync(windowStatePath(), 'utf8'))
    const state = { ...defaultWindowState, width: Number(saved.width) || defaultWindowState.width, height: Number(saved.height) || defaultWindowState.height, maximized: saved.maximized === true }
    if (Number.isFinite(saved.x) && Number.isFinite(saved.y)) {
      const visible = screen.getAllDisplays().some(({ workArea }) => saved.x < workArea.x + workArea.width - 50 && saved.x + state.width > workArea.x + 50 && saved.y >= workArea.y - 10 && saved.y < workArea.y + workArea.height - 50)
      if (visible) Object.assign(state, { x: saved.x, y: saved.y })
    }
    return state
  } catch {
    return { ...defaultWindowState }
  }
}

function trackWindowState(window, initial) {
  let timer
  let state = { ...initial }

  const capture = () => {
    if (window.isDestroyed()) return
    state.maximized = window.isMaximized()
    // Da massimizzata o a schermo intero i bounds sono quelli dello schermo: si tengono gli ultimi "normali".
    if (!state.maximized && !window.isMinimized() && !window.isFullScreen()) Object.assign(state, window.getBounds())
  }
  const persist = () => {
    try { fsSync.writeFileSync(windowStatePath(), JSON.stringify(state)) } catch (error) { console.error(error) }
  }
  const schedule = () => {
    capture()
    clearTimeout(timer)
    timer = setTimeout(persist, 400)
  }

  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) window.on(event, schedule)
  window.on('close', () => { clearTimeout(timer); capture(); persist() })
}

function createWindow() {
  const windowState = loadWindowState()
  // Tasti Indietro / Avanti del mouse e della tastiera multimediale (Windows): navigazione nella cronologia dei salti del documento.
  const navigationCommand = { 'browser-backward': 'nav-back', 'browser-forward': 'nav-forward' }
  mainWindow = new BrowserWindow({
    width: windowState.width,
    height: windowState.height,
    x: windowState.x,
    y: windowState.y,
    minWidth: 800,
    minHeight: 600,
    // Icona dell'app e colore di fondo iniziale (lo scuro antracite), per non far lampeggiare di bianco l'apertura.
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    backgroundColor: '#18181a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  applySpellcheck()
  mainWindow.on('app-command', (_event, command) => { if (navigationCommand[command]) mainWindow.webContents.send('app:command', navigationCommand[command]) })
  // Se il processo dell'interfaccia muore la finestra resta vuota e la console non dice nulla: si registra il motivo e si riprova a ricaricare (al massimo due volte).
  let reloads = 0
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logCrash(`render-process-gone: ${details.reason} (codice ${details.exitCode})`)
    // Domande in attesa di risposta: la pagina che le avrebbe mostrate non c'è più.
    for (const resolve of pendingQuestions.values()) resolve(false)
    pendingQuestions.clear()
    mcpBridge.rejectAll('The OpenWriter window stopped responding')
    if (details.reason !== 'clean-exit' && reloads < 2 && !mainWindow.isDestroyed()) {
      reloads += 1
      setTimeout(() => { if (!mainWindow.isDestroyed()) mainWindow.webContents.reload() }, 500)
    }
  })
  mainWindow.webContents.on('unresponsive', () => logCrash('la finestra non risponde'))
  mainWindow.webContents.on('responsive', () => logCrash('la finestra risponde di nuovo'))
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url, isMainFrame) => { if (isMainFrame) logCrash(`caricamento non riuscito: ${description} (${code}) ${url}`) })
  mainWindow.webContents.on('context-menu', (_event, params) => sendEditContextMenu(mainWindow.webContents, params))

  if (windowState.maximized) mainWindow.maximize()
  trackWindowState(mainWindow, windowState)

  // La scheda del browser è un <webview> isolato: niente preload, niente Node, partizione dedicata, solo http(s).
  mainWindow.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload
    webPreferences.nodeIntegration = false
    webPreferences.contextIsolation = true
    webPreferences.sandbox = true
    params.partition = BROWSER_PARTITION
    if (params.src && !/^(https?:|about:blank)/i.test(params.src)) event.preventDefault()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDevelopment) {
    // OPENWRITER_DEV_URL permette di puntare a un altro dev server (es. per le prove automatiche).
    mainWindow.loadURL(process.env.OPENWRITER_DEV_URL || 'http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

ipcMain.handle('document:open', openDocument)
ipcMain.handle('document:open-path', async (_event, filePath, { original = false } = {}) => {
  // Un documento collegato al progetto sta fuori dalla sua cartella ma si apre (e si modifica) lì dov'è.
  const target = linksStore.has(filePath) ? path.resolve(filePath) : resolveInProject(filePath)
  const stats = await fs.stat(target).catch(() => null)
  if (!stats) throw new Error(t('Could not open the file'))
  if (stats.isDirectory()) throw new Error(t('Not a file'))
  const document = await readDocument(target)
  // L'originale (DOCX/PDF) sotto un Markdown si apre così com'è, in sola lettura, senza convertirlo.
  if (original) return { ...document, readOnly: true }
  if (document.format === 'markdown') return document
  // DOCX e PDF del progetto diventano subito un Markdown con lo stesso nome, così l'assistente può lavorarci: se esiste già, si apre quello.
  const markdownPath = target.replace(/\.[^.\\/]+$/, '.md')
  if (fsSync.existsSync(markdownPath)) return readDocument(markdownPath)
  return { ...document, convertTo: markdownPath }
})
ipcMain.handle('document:reopen', (_event, filePath) => readSessionDocument(filePath))
// Server MCP per gli agenti esterni (vedi mcp-server.cjs): installato si avvia con il programma stesso (ELECTRON_RUN_AS_NODE), in sviluppo con Node.js.
ipcMain.handle('mcp:get-config', () => {
  const server = path.join(__dirname, 'mcp-server.cjs')
  const args = [server, '--data', app.getPath('userData')]
  return app.isPackaged
    ? { packaged: true, platform: process.platform, command: process.execPath, args, env: { ELECTRON_RUN_AS_NODE: '1' } }
    : { packaged: false, platform: process.platform, command: 'node', args, env: {} }
})
ipcMain.handle('session:load', () => loadSession({ startup: true }))
ipcMain.handle('session:save', (_event, session) => saveSession(session))
ipcMain.on('session:save-sync', (event, session) => {
  try { saveSession(session) } catch (error) { console.error(error) }
  event.returnValue = true
})
// Impostazioni e contesto di un progetto qualsiasi dell'elenco (non solo di quello aperto).
const projectFileFor = (directory) => {
  const target = path.resolve(String(directory || ''))
  if (!fsSync.existsSync(target) || !fsSync.statSync(target).isDirectory()) throw new Error(t('The project folder no longer exists'))
  return { target, file: createProjectFile({ getProjectPath: () => target }) }
}
ipcMain.handle('projects:get-settings', (_event, directory) => {
  const { file } = projectFileFor(directory)
  return file.getSettings()
})
ipcMain.handle('projects:save-settings', (_event, { directory, settings } = {}) => {
  const { target, file } = projectFileFor(directory)
  file.initialize()
  const saved = file.saveSettings(settings)
  if (projectPath && samePath(projectPath, target)) { applySpellcheck(); applyKnowledgeChoice(target, saved.options.searchIndex) } else if (!saved.options.searchIndex) knowledge.clear(target).catch(() => {})
  // Chi condivide o smette di condividere cambia ciò che gli altri progetti vedono (e quali vettori calcolare).
  if (projectPath && !samePath(projectPath, target)) configureSemantic()
  return saved
})
// Icona di un progetto (anche non aperto): un'immagine in `.ow`, ridimensionata; qui si legge, si sceglie e si toglie.
ipcMain.handle('projects:get-icon', (_event, directory) => projectIcon.getIcon(directory))
// Scelta in due tempi: qui si sceglie il file e se ne legge il contenuto (l'interfaccia lo decodifica e lo ridimensiona);
// poi `projects:save-icon` salva il risultato.
ipcMain.handle('projects:pick-icon', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: t('Choose the project icon'), properties: ['openFile'], filters: [{ name: t('Image'), extensions: projectIcon.ICON_EXTENSIONS }] })
  if (result.canceled || !result.filePaths[0]) return null
  return projectIcon.readSource(result.filePaths[0])
})
ipcMain.handle('projects:save-icon', (_event, { directory, kind, data } = {}) => {
  const { target, file } = projectFileFor(directory)
  file.initialize()
  return projectIcon.saveIcon(target, kind, data)
})
ipcMain.handle('projects:remove-icon', (_event, directory) => {
  projectIcon.removeIcon(projectFileFor(directory).target)
  return true
})
// Copia il contesto per l'assistente (context.md, gli altri .md di istruzioni e le skill in .ow) da un progetto a un altro.
// Configurazione condivisibile del progetto (contesto, skill, impostazioni; vedi project-pack.cjs): si esporta in un file e si importa in un altro progetto.
ipcMain.handle('projects:export-setup', async (_event, { directory } = {}) => {
  const { target, file } = projectFileFor(directory)
  const settings = file.getSettings()
  const base = (settings.name || path.basename(target)).replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 60) || 'project'
  const result = await dialog.showSaveDialog(mainWindow, {
    title: t('Export the project setup'),
    defaultPath: path.join(projectPath || target, `${base} - setup.json`),
    filters: [{ name: t('OpenWriter project setup'), extensions: ['json'] }],
  })
  if (result.canceled || !result.filePath) return null
  const pack = projectPack.buildPack({ settings, directory: target, appVersion: app.getVersion() })
  await fs.writeFile(result.filePath, JSON.stringify(pack, null, 2), 'utf8')
  return { path: result.filePath, ...projectPack.summarize({ ...pack, exportedAt: pack.exportedAt, app: pack.app, instructionFiles: pack.instructionFiles, skills: pack.skills }) }
})
// Importazione in due tempi: si sceglie e si legge il file (con un riepilogo da mostrare), poi si applica con le opzioni scelte.
const pendingSetups = new Map()
ipcMain.handle('projects:import-setup-choose', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('Import a project setup'),
    defaultPath: projectPath || undefined,
    properties: ['openFile'],
    filters: [{ name: t('OpenWriter project setup'), extensions: ['json'] }],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const stat = await fs.stat(result.filePaths[0])
  if (stat.size > 5 * 1024 * 1024) throw new Error(t('The setup file is too large'))
  const pack = projectPack.parsePack(await fs.readFile(result.filePaths[0], 'utf8'))
  const id = require('node:crypto').randomUUID()
  if (pendingSetups.size >= 5) pendingSetups.delete(pendingSetups.keys().next().value)
  pendingSetups.set(id, pack)
  return { id, fileName: path.basename(result.filePaths[0]), ...projectPack.summarize(pack) }
})
ipcMain.handle('projects:import-setup-apply', (_event, { id, directory, mode, overwrite, applySettings } = {}) => {
  const pack = pendingSetups.get(String(id))
  if (!pack) throw new Error(t('The setup file is no longer loaded: choose it again'))
  const { target, file } = projectFileFor(directory)
  const outcome = projectPack.applyPack({ pack, file, directory: target, mode: mode === 'append' ? 'append' : 'replace', overwrite: overwrite === true, applySettings: applySettings !== false })
  pendingSetups.delete(String(id))
  if (projectPath && samePath(projectPath, target)) applySpellcheck()
  return outcome
})
ipcMain.handle('projects:copy-context', (_event, { from, to, mode } = {}) => {
  const source = projectFileFor(from)
  const destination = projectFileFor(to)
  if (samePath(source.target, destination.target)) throw new Error(t('Choose a different project'))
  destination.file.initialize()
  const sourceSettings = source.file.getSettings()
  const incoming = String(sourceSettings.ai?.context || '')
  const extras = sourceSettings.ai?.extraContext || []
  const skillsSource = path.join(source.target, '.ow', 'skills')
  const skillFiles = fsSync.existsSync(skillsSource) ? fsSync.readdirSync(skillsSource).filter((name) => /\.md$/i.test(name)) : []
  if (!incoming.trim() && !extras.length && !skillFiles.length) throw new Error(t('The source project has no context'))
  const current = destination.file.getSettings()
  const existing = String(current.ai?.context || '')
  const merged = mode === 'append' && existing.trim() ? `${existing.trimEnd()}\n\n${incoming}` : incoming
  destination.file.saveSettings({ name: current.name, ai: { context: merged, language: current.ai.language, documentLanguage: current.ai.documentLanguage }, options: current.options, spellcheck: current.spellcheck })
  // Gli altri file di istruzioni si copiano solo se nel progetto di destinazione non esistono già.
  let copied = 0
  for (const extra of extras) {
    const target = path.join(destination.target, '.ow', extra.name)
    if (fsSync.existsSync(target)) continue
    fsSync.writeFileSync(target, extra.text)
    copied += 1
  }
  for (const name of skillFiles) {
    const target = path.join(destination.target, '.ow', 'skills', name)
    if (fsSync.existsSync(target)) continue
    fsSync.mkdirSync(path.dirname(target), { recursive: true })
    fsSync.copyFileSync(path.join(skillsSource, name), target)
    copied += 1
  }
  return { characters: destination.file.getSettings().ai.context.length, extraFiles: copied }
})
// Skill di scrittura. La catena dei progetti viene dal documento attivo o, con `directory`, da un progetto dell'elenco
// (es. un sotto-progetto nelle sue impostazioni); senza progetto restano solo le skill globali.
const skillChain = ({ document, directory } = {}) => {
  if (directory) return projectFileFor(directory).file.getContextChain()
  return projectFile.getContextChain(document || null)
}
ipcMain.handle('skills:list', (_event, request) => {
  const chain = skillChain(request)
  return { ...skillsStore.list(chain), defaults: [...new Set(chain.flatMap((owner) => owner.activeSkills || []))], chain: chain.map(({ base, name, path: relative, activeSkills }) => ({ base, name, path: relative, activeSkills })) }
})
ipcMain.handle('skills:get', (_event, request) => skillsStore.get(request || {}))
ipcMain.handle('skills:save', (_event, request) => skillsStore.save(request || {}))
ipcMain.handle('skills:delete', (_event, request) => skillsStore.remove(request || {}))
ipcMain.handle('skills:parse', (_event, markdown) => skillsStore.parse(markdown))
// Skill da un file Markdown con le direttive: si legge e si interpreta, il salvataggio avviene dopo la revisione nell'editor.
ipcMain.handle('skills:import-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { defaultPath: projectPath || undefined, properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }] })
  if (result.canceled || !result.filePaths[0]) return null
  const file = result.filePaths[0]
  const stat = await fs.stat(file)
  if (stat.size > MAX_SKILL_FILE_BYTES) throw new Error(t('The file is too large to be a skill (max {count} characters)', { count: MAX_SKILL_CHARS }))
  return skillFromMarkdown(await fs.readFile(file, 'utf8'), path.basename(file))
})
ipcMain.handle('skills:open-folder', (_event, { scope, base } = {}) => shell.openPath(skillsStore.openFolder(scope, base)))
ipcMain.handle('skills:set-active', (_event, { directory, active } = {}) => {
  if (directory) {
    const { file } = projectFileFor(directory)
    file.initialize()
    return file.setActiveSkills(active)
  }
  return projectFile.setActiveSkills(active)
})
ipcMain.handle('project:get-settings', () => projectFile.getSettings())
// Azioni rapide del progetto aperto (vedi project-file.cjs).
ipcMain.handle('project:set-quick-actions', (_event, value) => projectFile.setQuickActions(value))
// Contesto dell'assistente per il documento attivo: le istruzioni di tutti i progetti coinvolti, dal più esterno al più vicino.
ipcMain.handle('project:context-chain', (_event, filePath) => projectFile.getContextChain(filePath))
ipcMain.handle('project:save-settings', (_event, settings) => {
  const saved = projectFile.saveSettings(settings)
  applySpellcheck()
  applyKnowledgeChoice(projectPath, saved.options.searchIndex)
  return saved
})
// Chat in streaming: gli eventi (testo, ragionamento, stato) arrivano al renderer man mano, e la richiesta si può interrompere.
ipcMain.handle('ai:chat-stream', async (event, { requestId, messages, tools, reasoningCap, use, temperature }) => {
  const controller = new AbortController()
  aiRequests.set(requestId, controller)
  try {
    return await aiProviders.chatStream(messages, {
      signal: controller.signal,
      tools: Array.isArray(tools) ? tools : [],
      reasoningCap: reasoningCap === 'low' || reasoningCap === 'instant' ? reasoningCap : null,
      temperature: cleanTemperature(temperature),
      use: use && typeof use === 'object' ? { provider: String(use.provider || ''), model: String(use.model || '') } : null,
      onEvent: (payload) => { if (!event.sender.isDestroyed()) event.sender.send('ai:stream', { requestId, event: payload }) },
    })
  } catch (error) {
    // Un'interruzione voluta non è un errore: si risponde null e il preload la riconverte in un rifiuto lato renderer.
    if (error.name === 'AbortError') return null
    throw error
  } finally {
    aiRequests.delete(requestId)
  }
})
ipcMain.handle('ai:cancel', (_event, requestId) => { aiRequests.get(requestId)?.abort(); return true })
// Ricerca nei file per l'assistente: vale anche per le cartelle di riferimento (`@sigla/…`), i cui percorsi tornano con il prefisso.
ipcMain.handle('tools:search-files', async (_event, args = {}) => {
  const { tools, relative, prefix } = toolsFor(String(args.path || ''))
  const result = await tools.search({ ...args, path: relative || '.' })
  if (prefix && result.results) result.results = result.results.map((entry) => ({ ...entry, path: withPrefix(prefix, entry.path) }))
  return formatSearch(result)
})
// Acceso o spento dalle impostazioni del progetto: spento, l'indice del progetto si svuota (si ricostruisce riaccendendolo).
function applyKnowledgeChoice(directory, enabled) {
  if (!directory) return
  const isOpen = projectPath && samePath(projectPath, directory)
  if (isOpen) knowledgeOn = enabled !== false
  if (enabled === false) { knowledge.clear(directory).catch(() => {}); if (isOpen) { stopReferenceWatch(); configureSemantic() } }
  else if (isOpen) startKnowledge()
}
// Ricerca per significato: stato dei pacchetti (scaricati o no), dispositivo scelto e in uso, scheda video e avanzamento dei vettori per il progetto aperto.
// `pack` è il pacchetto del dispositivo in uso (o di quello scelto, se nessuno è installato): è ciò che mostrano le impostazioni del progetto.
async function semanticStatus(directory) {
  const target = directory ? path.resolve(String(directory)) : projectPath
  const isOpen = Boolean(projectPath && target && samePath(projectPath, target))
  const enabled = isOpen ? knowledgeOn : Boolean(target && createProjectFile({ getProjectPath: () => target }).searchIndexEnabled())
  const wanted = wantedDevice()
  const using = activeDevice()
  const result = {
    pack: semanticPacks[using || wanted].status(),
    packs: { cpu: semanticPacks.cpu.status(), gpu: semanticPacks.gpu.status() },
    device: wanted,
    activeDevice: using,
    gpu: { info: gpuInfo, failure: gpuFailure },
    enabled,
    allowed: semanticAllowed(),
    progress: null,
  }
  const targets = isOpen ? semanticTargets() : []
  if (targets.length && knowledge.available) {
    try { result.progress = await knowledge.semanticStatus(targets) } catch (error) { result.progress = { error: error.message } }
  }
  return result
}
ipcMain.handle('semantic:status', (_event, directory) => semanticStatus(directory))
// Interruttore globale del modello (Impostazioni → Modelli locali): spento, nessun progetto lo usa e i calcoli si fermano.
ipcMain.handle('semantic:set-enabled', async (_event, enabled) => {
  setPreferenceValue(EMBEDDINGS_PREFERENCE, enabled ? 'on' : 'off')
  await configureSemantic()
  return semanticStatus()
})
// Dispositivo del calcolo: 'cpu' o 'gpu' (se la scheda video non è supportata o manca il pacchetto, si usa la CPU finché non lo è). Scegliere di nuovo la GPU cancella l'ultimo guasto.
ipcMain.handle('semantic:set-device', async (_event, device) => {
  setPreferenceValue(DEVICE_PREFERENCE, device === 'gpu' ? 'gpu' : 'cpu')
  gpuFailure = null
  await configureSemantic()
  return semanticStatus()
})
// Chiede a WebGPU quale scheda userebbe (senza caricare il modello): l'interfaccia lo usa per dire se la GPU è supportata.
ipcMain.handle('semantic:probe-gpu', async () => {
  try { gpuInfo = await gpuContext.probe() } catch (error) { gpuInfo = { webgpu: false, reason: error.message } }
  return semanticStatus()
})
// Avanzamento dell'indice per la barra in fondo alla finestra: scansione dei file e vettori ancora da calcolare per il progetto aperto.
ipcMain.handle('knowledge:activity', async () => {
  const result = { scanning: knowledge.available && knowledge.syncing, vectors: null }
  const targets = semanticTargets()
  if (targets.length && knowledge.available) {
    try {
      const status = await knowledge.semanticStatus(targets)
      if (!status.error && status.total > status.embedded) result.vectors = { embedded: status.embedded, total: status.total }
    } catch { /* senza stato non c'è barra */ }
  }
  return result
})
const packKind = (device) => (device === 'gpu' ? 'gpu' : device === 'cpu' ? 'cpu' : wantedDevice())
// Scarica un pacchetto (qualche minuto): l'interfaccia ne segue l'avanzamento chiedendo lo stato. Niente parte da solo: è l'utente a chiederlo.
ipcMain.handle('semantic:install', async (_event, directory, device) => {
  const kind = packKind(device)
  await semanticPacks[kind].install()
  if (kind === 'gpu') gpuFailure = null
  await configureSemantic()
  return semanticStatus(directory)
})
// Toglie un pacchetto e i vettori di quel modello (quelli dell'altro dispositivo restano).
ipcMain.handle('semantic:remove', async (_event, directory, device) => {
  const kind = packKind(device)
  semanticPacks[kind].remove()
  if (kind === 'gpu') gpuContext.release()
  await configureSemantic({ purge: [semanticPacks[kind].id] })
  return semanticStatus(directory)
})
// Stato dell'indice di un progetto (aperto o no) e ricostruzione dai file.
async function knowledgeStatus(directory) {
  const target = directory ? path.resolve(String(directory)) : projectPath
  if (!target) return { enabled: false, available: false, files: 0, chunks: 0, updatedAt: null }
  const enabled = projectPath && samePath(projectPath, target) ? knowledgeOn : createProjectFile({ getProjectPath: () => target }).searchIndexEnabled()
  if (!knowledge.available) return { enabled, available: false, error: knowledge.error, files: 0, chunks: 0, updatedAt: null }
  try { return { enabled, available: true, ...(await knowledge.stats(target)) } } catch (error) { return { enabled, available: false, error: error.message, files: 0, chunks: 0, updatedAt: null } }
}
ipcMain.handle('project:knowledge-status', (_event, directory) => knowledgeStatus(directory))
ipcMain.handle('project:knowledge-rebuild', async (_event, directory) => {
  const target = directory ? path.resolve(String(directory)) : projectPath
  if (!target) throw new Error(t('No project open'))
  if (!knowledge.available) throw new Error(knowledge.error || 'The search index is not available')
  await knowledge.rebuild(target)
  // Un progetto aggiunto da poco può non essere ancora tra quelli di cui calcolare i vettori: senza, ricostruito l'indice non avrebbe mai il suo significato.
  await configureSemantic()
  return knowledgeStatus(target)
})
// Ricerca per rilevanza sull'indice (knowledge-index.cjs): passaggi con file e righe. Non vale per le cartelle di riferimento.
// Cosa sta fuori da un progetto e si cerca insieme ad esso: le cartelle di riferimento collegate e gli altri progetti che condividono. Per il progetto aperto sono quelle in uso;
// per un altro progetto (un agente esterno che lavora altrove) si leggono i suoi riferimenti. Senza progetto: tutti i progetti che condividono.
// `everything` (la ricerca della Home, che è dell'utente e non di un assistente): tutti i progetti con l'indice acceso, anche quelli che non condividono la loro conoscenza. Condividere
// decide solo cosa vedono gli ALTRI progetti e i loro assistenti; le informazioni, nel proprio indice, ci sono comunque.
function outsideFor(base, { everything = false } = {}) {
  if (base && projectPath && samePath(base, projectPath)) return outsideFolders()
  let references = []
  try { references = base ? createReferencesStore({ getProjectPath: () => base }).list() : [] } catch { references = [] }
  try {
    return outsideFoldersOf({ current: base, references, projects: projectsStore.list(), isShared: (directory) => { const file = createProjectFile({ getProjectPath: () => directory }); return everything ? file.searchIndexEnabled() : file.sharedKnowledgeEnabled() }, webFolderOf })
  } catch { return [] }
}
// Ricerca per rilevanza (e per significato, se c'è il modello) nel progetto, nei suoi riferimenti e negli altri progetti. Non dipende dal progetto aperto: `project` (un agente
// esterno) indica da quale progetto si cerca; senza, si usa quello aperto, e senza nessuno si cerca in tutti i progetti che condividono la loro conoscenza.
async function runKnowledgeSearch(args = {}, { project: asked = null, home = false } = {}) {
  const known = (directory) => Boolean((projectPath && samePath(directory, projectPath)) || projectsStore.list().some((item) => samePath(item.path, directory)))
  // `home`: la ricerca della Home non parte da nessun progetto, anche se uno è aperto: cerca in tutti quelli che condividono la conoscenza.
  const base = home ? null : asked && known(path.resolve(String(asked))) ? path.resolve(String(asked)) : (asked ? null : projectPath)
  const query = String(args.query || '').trim()
  if (!query) throw new Error('Missing parameter "query"')
  if (!knowledge.available) throw new Error('The search index is not available: use search_files')
  if (base) {
    const on = projectPath && samePath(base, projectPath) ? knowledgeOn : createProjectFile({ getProjectPath: () => base }).searchIndexEnabled()
    if (!on) throw new Error('The search index is turned off for this project: use search_files')
  } else if (!asked && !projectPath && !home) throw new Error(t('No project open'))
  const given = String(args.path || '').trim().replace(/\\/g, '/')
  // `others` (o il vecchio `references`): tutto ciò che sta fuori dal progetto, cioè gli altri progetti e le cartelle di riferimento.
  const wanted = String(args.scope || '').toLowerCase()
  const scope = wanted === 'project' ? 'project' : (wanted === 'others' || wanted === 'references') ? 'others' : 'all'
  const outside = outsideFor(base, { everything: home })
  const sourceOf = (item) => ({ key: knowledge.key(item.path), prefix: `@${item.name}`, item })
  let sources
  let folder = ''
  if (given.startsWith('@')) {
    const [name, ...rest] = given.slice(1).split('/')
    const found = outside.find((item) => item.name.toLowerCase() === name.toLowerCase())
    if (!found) throw new Error(`Reference folder or project "@${name}" not found: the root listing shows the available ones`)
    sources = [sourceOf(found)]
    folder = rest.filter(Boolean).join('/')
  } else {
    if (given && given !== '.' && given !== '/') {
      if (!base) throw new Error('A path of the project needs a project: use "@name/…" or leave the path out')
      if (projectPath && samePath(base, projectPath)) folder = path.relative(projectPath, resolveInProject(path.join(projectPath, given))).split(path.sep).join('/')
      else {
        const clean = path.posix.normalize(given).replace(/^\/+/, '')
        if (clean.startsWith('..')) throw new Error('The path is outside the project')
        folder = clean === '.' ? '' : clean
      }
    }
    const projectSource = base ? { key: knowledge.key(base), prefix: '', item: null } : null
    // Un percorso del progetto restringe la ricerca al progetto.
    sources = folder ? [projectSource] : [...(scope === 'others' || !projectSource ? [] : [projectSource]), ...(scope === 'project' ? [] : outside.map(sourceOf))]
  }
  if (!sources.length) throw new Error('There are no other projects or reference folders to search: use scope "project" or leave it out')
  const [found, ...stats] = await Promise.all([
    knowledge.search(sources.map((source) => source.key), query, { folder, limit: Number(args.maxResults) || 10, semantic: semanticAvailable(), includeWeak: args.includeWeak === true }),
    ...sources.map((source) => knowledge.stats(source.key)),
  ])
  const prefixes = new Map(sources.map((source) => [source.key, source.prefix]))
  const bySource = new Map(sources.map((source) => [source.key, source]))
  found.results = found.results.map((entry) => ({ ...entry, source: bySource.get(entry.project), path: withPrefix(prefixes.get(entry.project) ?? '', entry.path), relative: entry.path }))
  return { query, found, files: stats.reduce((total, item) => total + item.files, 0), outside }
}
async function searchKnowledgeTool(args = {}, readTool = 'read_file', context = {}) {
  const { query, found, files } = await runKnowledgeSearch(args, context)
  return formatKnowledgeResults(query, { ...found, results: found.results.map(({ source: _source, relative: _relative, ...entry }) => entry) }, { files }, readTool)
}
// Ricerca della Home: gli stessi passaggi che vedrebbe l'assistente, ma strutturati (con il progetto di ogni passaggio e il file da aprire).
// Sinonimi dai propri testi per una domanda: per ogni parola significativa (4+ lettere, non una parola funzionale), le parole del vocabolario dei progetti più vicine per
// significato (vedi knowledge-worker.cjs, operazione `synonyms`). Funziona solo con la ricerca per significato attiva e il vocabolario già vettorizzato; altrimenti [].
async function localSynonyms(query) {
  if (!knowledge.available || !semanticAvailable()) return []
  const fold = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const words = [...new Set((String(query).match(/\p{L}+/gu) || []).map(fold).filter((word) => word.length >= 4 && !STOPWORDS.has(word)))].slice(0, 6)
  if (!words.length) return []
  try {
    const found = await knowledge.synonyms(words)
    return [...new Set(found.flatMap((entry) => entry.near.map((item) => item.word)))].slice(0, 6)
  } catch { return [] }
}

async function searchProjectsForHome(args = {}) {
  const maxResults = Math.min(30, Math.max(1, Number(args.maxResults) || 20))
  const query = String(args.query || '').trim()
  // `terms`: sinonimi e termini affini chiesti dall'interfaccia al modello linguistico; ognuno si cerca a parte (parole e significato) e i risultati si uniscono.
  // Ai sinonimi dell'IA (se ci sono) si aggiungono sempre quelli locali: le parole dei testi più vicine per significato a quelle cercate (`local: false` li esclude).
  const localTerms = args.local === false ? [] : await localSynonyms(query)
  const terms = cleanTerms([...(Array.isArray(args.terms) ? args.terms : []), ...localTerms], query, 12)
  // `includeWeak`: anche i passaggi che il filtro di pertinenza scarta ("meno pertinenti"), con `weak: true`, ordinati per pertinenza.
  const includeWeak = args.includeWeak === true
  const base = await runKnowledgeSearch({ query, maxResults, includeWeak }, { home: true })
  const { found, files, outside } = base
  // Le pagine web salvate di un progetto (`@nome-web`) appartengono a quel progetto.
  const ownerOf = (item) => (item.web ? outside.find((other) => other.project && (item.name === `${other.name}-web` || item.name.startsWith(`${other.name}-web-`))) || null : item)
  const shape = (entries) => entries.flatMap((entry) => {
    const item = entry.source?.item
    const owner = item ? ownerOf(item) : null
    if (!item || !owner) return []
    return [{
      project: owner.path, projectName: owner.name, file: entry.relative, absolute: path.join(item.path, entry.relative),
      display: entry.path, heading: entry.heading || '', startLine: entry.startLine, endLine: entry.endLine, snippet: String(entry.snippet || '').replace(/\s+/g, ' ').trim(),
      // Perché compare: 'words' (contiene le parole), 'meaning' (solo per significato) o 'both'.
      via: entry.via || 'words',
      // Pertinenza 0-1 (da quanto il passaggio si stacca dagli altri per questa domanda) e punteggio z; assenti senza ricerca per significato.
      ...(entry.relevance !== undefined ? { relevance: Math.round(entry.relevance * 100) / 100 } : {}),
      ...(entry.z !== undefined ? { z: Math.round(entry.z * 10) / 10 } : {}),
      ...(entry.weak ? { weak: true } : {}),
    }]
  })
  let results = shape(found.results)
  let weakCount = found.weakCount || 0
  if (terms.length) {
    const extra = await Promise.all(terms.map(async (term) => {
      try {
        const { found: termFound } = await runKnowledgeSearch({ query: term, maxResults: 10, includeWeak }, { home: true })
        weakCount += termFound.weakCount || 0
        return { term, original: false, results: shape(termFound.results) }
      } catch { return { term, original: false, results: [] } }
    }))
    results = mergeSearches([{ term: query, original: true, results }, ...extra], { limit: maxResults + 10 })
  }
  // `partial`: nessun passaggio contiene tutte le parole (si mostrano quelli che ne hanno qualcuna).
  return { query, terms, localTerms: terms.filter((term) => localTerms.includes(term)), mode: found.mode, partial: found.mode === 'or' || Boolean(found.partial), weakCount, files, results }
}
ipcMain.handle('projects:search', (_event, args) => searchProjectsForHome(args))

// Dati del grafo della Home: ogni progetto (con le sue opzioni) e le connessioni per affinità. I vettori medi si ricalcolano solo se l'indice del progetto è cambiato.
const centroidCache = new Map() // chiave → { signature, vector }
ipcMain.handle('projects:graph', async (_event, options = {}) => {
  const list = projectsStore.list().filter((item) => item && item.path)
  const device = semanticAllowed() ? activeDevice() : null
  const model = device ? semanticPacks[device].id : ''
  const nodes = []
  for (const item of list) {
    const base = { path: item.path, name: item.name, missing: Boolean(item.missing), openedAt: item.openedAt || null }
    if (item.missing) { nodes.push({ ...base, indexed: false, shared: false, files: 0, chunks: 0, updatedAt: null }); continue }
    let file = null
    try { file = createProjectFile({ getProjectPath: () => item.path }) } catch { file = null }
    const indexed = Boolean(file?.searchIndexEnabled())
    const shared = Boolean(file?.sharedKnowledgeEnabled())
    let stats = { files: 0, chunks: 0, updatedAt: null }
    if (indexed && knowledge.available) { try { stats = await knowledge.stats(item.path) } catch { /* senza statistiche il progetto resta senza linee */ } }
    nodes.push({ ...base, indexed, shared, files: stats.files, chunks: stats.chunks, updatedAt: stats.updatedAt })
  }
  // Un progetto che condivide e ha l'indice acceso ma nessun passaggio (appena aggiunto): si indicizza (non più spesso di ogni due minuti), senza aspettare l'apertura.
  // `options.refresh` (il pulsante Aggiorna della Home): tutti i progetti con l'indice acceso si riallineano ai file, aperti o no. Altrimenti solo quelli senza ancora
  // alcun passaggio (appena aggiunti) ogni due minuti e gli altri ogni dieci.
  const force = options?.refresh === true
  const live = nodes.filter((node) => node.indexed && !node.missing)
  syncProjects(live.filter((node) => node.chunks === 0).map((node) => node.path), { force, every: 120000 })
  syncProjects(live.filter((node) => node.chunks > 0).map((node) => node.path), { force })
  // I vettori si calcolano per i progetti dell'elenco corrente: se è cambiato dall'ultima configurazione, si riconfigura.
  if (knowledge.available && semanticAvailable()) {
    const wanted = semanticTargets().map((item) => knowledge.key(item)).sort().join('|')
    if (wanted && wanted !== semanticSignature) await configureSemantic()
  }
  const sharing = nodes.filter((node) => node.shared && node.chunks > 0)
  let vectors = new Map()
  let pending = new Set()
  if (model && knowledge.available && sharing.length > 1) {
    try {
      ({ vectors, pending } = await collectVectors({
        nodes: sharing, model, cache: centroidCache, key: (directory) => knowledge.key(directory),
        centroids: (paths) => knowledge.centroids(paths),
        status: async (directory) => { try { return await knowledge.semanticStatus([directory]) } catch { return null } },
      }))
    } catch (error) { console.error('Vettori medi dei progetti non calcolati:', error.message) }
  }
  for (const node of nodes) node.pendingVectors = pending.has(node.path)
  // Un sotto-progetto sta dentro la cartella di un altro progetto dell'elenco: `parent` è quello più vicino (il più interno), altrimenti null. Nel grafo è un satellite del padre.
  const parents = parentProjects(nodes, { isSameOrInside, samePath })
  for (const node of nodes) node.parent = parents.get(node.path) || null
  let edges = []
  let approximate = false
  if (vectors.size > 1) edges = affinityEdges(sharing.filter((node) => vectors.has(node.path)).map((node) => ({ id: node.path, vector: vectors.get(node.path) })))
  else if (sharing.length > 1) { edges = uniformEdges(sharing.map((node) => node.path)); approximate = true }
  // `busy`: l'indice sta ancora lavorando (scansione o vettori): l'interfaccia riguarda il grafo finché non ha finito.
  // Un satellite si lega solo al padre: niente sinapsi di affinità da o verso i sotto-progetti.
  const satellites = new Set(nodes.filter((node) => node.parent).map((node) => node.path))
  edges = edges.filter((edge) => !satellites.has(edge.a) && !satellites.has(edge.b))
  const busy = pending.size > 0 || (knowledge.available && knowledge.syncing)
  return { nodes, edges, approximate, busy, semantic: vectors.size > 1 }
})
ipcMain.handle('tools:search-knowledge', (_event, args) => searchKnowledgeTool(args))
// Gli strumenti di lettura valgono anche per le cartelle di riferimento: un percorso `@sigla/…` si legge dentro quella cartella (e solo lì).
// `@sigla/…` → la radice: un riferimento, oppure un altro progetto che condivide la sua conoscenza.
function outsideRoot(given) {
  try { return referencesStore.resolve(given) } catch (error) {
    const [name, ...rest] = String(given || '').slice(1).replace(/\\/g, '/').split('/')
    const outside = outsideFolders().find((item) => item.name.toLowerCase() === name.toLowerCase())
    if (!outside) throw error
    return { name: outside.name, root: outside.path, relative: rest.filter(Boolean).join('/') }
  }
}
function toolsFor(given) {
  const reference = projectPath ? outsideRoot(given) : null
  if (!reference) return { tools: projectTools, relative: given, prefix: '' }
  return { tools: createProjectTools({ getProjectPath: () => reference.root, readDocument: (filePath) => readDocument(filePath) }), relative: reference.relative, prefix: `@${reference.name}` }
}
const withPrefix = (prefix, relative) => (prefix ? (relative && relative !== '.' ? `${prefix}/${relative}` : `${prefix}/`) : relative)

ipcMain.handle('tools:list-directory', async (_event, relativePath, options = {}) => {
  const { tools, relative, prefix } = toolsFor(relativePath)
  const result = await tools.listDirectory(relative, { sort: options?.sort === 'date' ? 'date' : 'name' })
  if (prefix) result.path = withPrefix(prefix, result.path)
  else {
    // Immagini con una descrizione salvata (describe_image): l'assistente, anche in un'altra chat, sa che può leggerla.
    for (const entry of result.entries) {
      if (entry.type !== 'file' || !/\.(png|jpe?g|gif|webp|bmp)$/i.test(entry.name)) continue
      try { if (fsSync.existsSync(imageDescriptionFile(result.path === '.' ? entry.name : `${result.path}/${entry.name}`))) entry.described = true } catch { /* nome non valido */ }
    }
  }
  if (!prefix && result.path === '.') { result.linked = linksStore.list(); const linked = referencesStore.list(); result.references = [...linked, ...outsideFolders().filter((item) => !linked.some((reference) => reference.name === item.name)).map((item) => ({ name: item.name, path: item.path, ...(item.project ? { project: true } : {}), ...(item.web ? { web: true } : {}) }))] }
  return result
})
ipcMain.handle('tools:read-file', async (_event, { path: relativePath, offset, limit, startLine, endLine } = {}) => {
  const { tools, relative, prefix } = toolsFor(relativePath)
  const result = await tools.readFile(relative, { offset, limit, startLine, endLine, absolute: !prefix && linksStore.has(relativePath) })
  if (prefix) result.path = withPrefix(prefix, result.path)
  return result
})
ipcMain.handle('ai:capabilities', (_event, model) => aiProviders.getCapabilities(model))
ipcMain.handle('images:fetch', (_event, url) => images.fetchImage(String(url)))
ipcMain.handle('images:read-file', async (_event, relativePath) => { const { tools, relative } = toolsFor(relativePath); return images.prepareBuffer(await tools.readImage(relative)) })
// Descrizione di un'immagine del progetto, salvata dall'assistente in .ow/image-descriptions/ (un file .md per immagine) e riletta al posto
// dell'immagine: evita di riguardarla ogni volta. L'utente può modificarla o cancellarla a mano.
function imageDescriptionFile(relativePath) {
  if (!projectPath) throw new Error(t('No project open'))
  const relative = String(relativePath || '').replace(/[\\]/g, '/').replace(/^\/+/, '')
  if (!relative || relative.split('/').some((part) => part === '..' || part === '.ow')) throw new Error(t('Invalid name'))
  return path.join(projectPath, '.ow', 'image-descriptions', `${relative.replace(/\//g, '__')}.md`)
}
ipcMain.handle('images:read-description', async (_event, relativePath) => fs.readFile(imageDescriptionFile(relativePath), 'utf8').catch(() => null))
ipcMain.handle('images:write-description', async (_event, relativePath, description) => {
  const target = imageDescriptionFile(relativePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  writeFileAtomic(target, String(description ?? '').trim().slice(0, 20000))
})
// Schermate: solo la finestra dell'app o le sue schede browser (webview), mai altro.
ipcMain.handle('images:capture-page', async (_event, rect) => {
  const area = { x: Math.max(0, Math.round(rect.x)), y: Math.max(0, Math.round(rect.y)), width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }
  return images.prepareImage(await mainWindow.webContents.capturePage(area))
})
ipcMain.handle('images:capture-webview', async (_event, contentsId) => {
  const contents = webContents.fromId(Number(contentsId))
  if (!contents || contents.getType() !== 'webview' || contents.hostWebContents !== mainWindow.webContents) throw new Error(t('Invalid browser tab'))
  return images.prepareImage(await contents.capturePage())
})
// Le pagine del browser integrato seguono il tema del sistema operativo, non quello dell'app: con l'app in tema chiaro e il sistema scuro una pagina "scura" mostrava
// testo chiaro su fondo bianco. Qui si fa sì che dichiarino lo stesso tema dell'app (prefers-color-scheme).
ipcMain.handle('browser:set-color-scheme', async (_event, { contentsId, dark } = {}) => {
  const contents = webContents.fromId(Number(contentsId))
  if (!contents || contents.getType() !== 'webview' || contents.hostWebContents !== mainWindow.webContents) return false
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3')
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }] })
    return true
  } catch (error) {
    console.warn('Tema della pagina non applicato:', error.message)
    return false
  }
})
// Navigazioni comandate dall'assistente o da un agente: mentre durano, la scheda non può raggiungere la rete locale o privata, né aprendo l'indirizzo né seguendo un
// reindirizzamento, né con un nome che il DNS risolve in un indirizzo privato (vedi private-address.mjs). Le pagine che l'utente apre da sé non sono toccate.
const guardedBrowsers = new Set()
const guardedSessions = new WeakSet()
const privateAddress = () => import(pathToFileURL(path.join(__dirname, 'private-address.mjs')).href)
async function isPublicDestination(rawUrl) {
  const { isPrivateHost, isPrivateAddress } = await privateAddress()
  let url
  try { url = new URL(rawUrl) } catch { return false }
  if (!/^https?:$/.test(url.protocol) || isPrivateHost(url.hostname)) return false
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isPrivateAddress(host)) return false
  try {
    const found = await require('node:dns').promises.lookup(host, { all: true })
    return found.every((entry) => !isPrivateAddress(entry.address))
  } catch { return true } // non si risolve: la pagina non si caricherebbe comunque
}
function guardSession(contents) {
  if (guardedSessions.has(contents.session)) return
  guardedSessions.add(contents.session)
  contents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (!guardedBrowsers.has(details.webContentsId) || !['mainFrame', 'subFrame'].includes(details.resourceType)) { callback({}); return }
    isPublicDestination(details.url).then((allowed) => callback({ cancel: !allowed }), () => callback({ cancel: true }))
  })
}
ipcMain.handle('browser:guard-agent', (_event, { contentsId, on } = {}) => {
  const contents = webContents.fromId(Number(contentsId))
  if (!contents || contents.getType() !== 'webview' || contents.hostWebContents !== mainWindow.webContents) return false
  if (on) { guardSession(contents); guardedBrowsers.add(contents.id) } else guardedBrowsers.delete(contents.id)
  return true
})
// Schermata della scheda del browser, a piena risoluzione, salvata come PNG in <progetto>/screenshots/. Restituisce il percorso del file.
ipcMain.handle('browser:save-screenshot', async (_event, { contentsId, title } = {}) => {
  if (!projectPath) throw new Error(t('Open a project folder to save screenshots'))
  const contents = webContents.fromId(Number(contentsId))
  if (!contents || contents.getType() !== 'webview' || contents.hostWebContents !== mainWindow.webContents) throw new Error(t('Invalid browser tab'))
  const image = await contents.capturePage()
  if (image.isEmpty()) throw new Error(t('Empty image or unsupported format'))
  const directory = path.join(projectPath, 'screenshots')
  await fs.mkdir(directory, { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
  const label = String(title || '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'screenshot'
  let target = path.join(directory, `${label}-${stamp}.png`)
  for (let counter = 2; fsSync.existsSync(target); counter += 1) target = path.join(directory, `${label}-${stamp}-${counter}.png`)
  await fs.writeFile(target, image.toPNG())
  return target
})
ipcMain.handle('browser-history:list', (_event, { agent } = {}) => historyFor(agent === true).list())
ipcMain.handle('browser-history:add', (_event, { agent, ...entry } = {}) => historyFor(agent === true).add(entry))
ipcMain.handle('browser-history:remove', (_event, url, { agent } = {}) => historyFor(agent === true).remove(url))
ipcMain.handle('browser-history:clear', (_event, { agent } = {}) => historyFor(agent === true).clear())
ipcMain.handle('chat:save-attachment', (_event, attachment) => chatStore.saveAttachment(attachment || {}))
ipcMain.handle('chat:get-attachment', (_event, id) => chatStore.getAttachment(id))
// File allegati dall'utente in chat (scelti col dialogo o trascinati, anche fuori dal progetto): solo immagini e PDF,
// che il modello legge in modo nativo. Le immagini vengono normalizzate (ridimensionate, PNG o JPEG).
const CHAT_IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp']
const MAX_CHAT_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_CHAT_PDF_BYTES = 20 * 1024 * 1024
async function readChatAttachment(filePath) {
  const absolute = path.resolve(String(filePath || ''))
  const name = path.basename(absolute)
  const extension = path.extname(absolute).slice(1).toLowerCase()
  const isPdf = extension === 'pdf'
  if (!isPdf && !CHAT_IMAGE_EXTENSIONS.includes(extension)) throw new Error(t('{name}: only images and PDF files can be attached', { name }))
  const stat = await fs.stat(absolute)
  if (!stat.isFile()) throw new Error(t('{name}: only images and PDF files can be attached', { name }))
  const limit = isPdf ? MAX_CHAT_PDF_BYTES : MAX_CHAT_IMAGE_BYTES
  if (stat.size > limit) throw new Error(t('{name} is too large (max {size} MB)', { name, size: Math.round(limit / 1024 / 1024) }))
  const buffer = await fs.readFile(absolute)
  if (isPdf) {
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error(t('{name} is not a valid PDF file', { name }))
    return { kind: 'pdf', mime: 'application/pdf', data: buffer.toString('base64'), label: name, size: buffer.length }
  }
  // Formati che Electron non decodifica (es. WebP, GIF): il renderer li converte in PNG e li ripassa da `chat:prepare-image`.
  try {
    return { kind: 'image', ...images.prepareBuffer(buffer), label: name, size: buffer.length }
  } catch {
    return { kind: 'raw-image', mime: `image/${extension === 'jpg' ? 'jpeg' : extension}`, data: buffer.toString('base64'), label: name, size: buffer.length }
  }
}
ipcMain.handle('chat:pick-attachments', async (_event, { images: allowImages = false, pdf = false } = {}) => {
  const extensions = [...(allowImages ? CHAT_IMAGE_EXTENSIONS : []), ...(pdf ? ['pdf'] : [])]
  if (!extensions.length) return []
  const result = await dialog.showOpenDialog(mainWindow, { defaultPath: projectPath || undefined, properties: ['openFile', 'multiSelections'], filters: [{ name: t('Attachments'), extensions }] })
  return result.canceled ? [] : result.filePaths
})
ipcMain.handle('chat:read-attachment', (_event, filePath) => readChatAttachment(filePath))
// Immagine incollata o convertita dal renderer (base64): stessa normalizzazione delle altre.
ipcMain.handle('chat:prepare-image', (_event, { data } = {}) => {
  const buffer = Buffer.from(String(data || ''), 'base64')
  if (!buffer.length) throw new Error(t('Empty image or unsupported format'))
  if (buffer.length > MAX_CHAT_IMAGE_BYTES) throw new Error(t('Image too large'))
  return images.prepareBuffer(buffer)
})
ipcMain.handle('notes:list', (_event, filePath) => notesStore.list(filePath))
ipcMain.handle('notes:list-all', () => notesStore.listAll())
ipcMain.handle('notes:add', (_event, { filePath, note }) => notesStore.add(filePath, note))
ipcMain.handle('notes:update', (_event, { filePath, id, changes }) => notesStore.update(filePath, id, changes))
ipcMain.handle('notes:delete', (_event, { filePath, id }) => notesStore.remove(filePath, id))
ipcMain.handle('bookmarks:list', (_event, filePath) => bookmarksStore.list(filePath))
ipcMain.handle('bookmarks:list-all', () => bookmarksStore.listAll())
ipcMain.handle('bookmarks:add', (_event, { filePath, bookmark }) => bookmarksStore.add(filePath, bookmark))
ipcMain.handle('bookmarks:update', (_event, { filePath, id, changes }) => bookmarksStore.update(filePath, id, changes))
ipcMain.handle('bookmarks:delete', (_event, { filePath, id }) => bookmarksStore.remove(filePath, id))
ipcMain.handle('chat:list', () => chatStore.list())
ipcMain.handle('chat:get', (_event, id) => chatStore.get(id))
ipcMain.handle('chat:create', (_event, conversation) => chatStore.create(conversation || {}))
ipcMain.handle('chat:save', (_event, conversation) => chatStore.save(conversation))
ipcMain.handle('chat:delete', (_event, id) => chatStore.remove(id))
ipcMain.handle('chat:open-folder', () => shell.openPath(chatStore.ensureDirectory()))
ipcMain.handle('spellcheck:get', () => spellcheckState())
ipcMain.handle('spellcheck:set-global', (_event, languages) => {
  const cleaned = Array.isArray(languages) ? [...new Set(languages.filter((language) => typeof language === 'string'))] : []
  fsSync.mkdirSync(app.getPath('userData'), { recursive: true })
  fsSync.writeFileSync(spellcheckFilePath(), JSON.stringify({ languages: cleaned }, null, 2))
  applySpellcheck()
  return spellcheckState()
})
ipcMain.handle('history:list', (_event, filePath) => projectFile.listVersions(filePath))
ipcMain.handle('history:get', (_event, { filePath, id }) => projectFile.getVersion(filePath, id))
ipcMain.handle('history:add', (_event, { filePath, markdown, label }) => projectFile.addVersion(filePath, String(markdown ?? ''), { label: label || '' }))
ipcMain.handle('history:delete', (_event, { filePath, id }) => projectFile.deleteVersion(filePath, id))
ipcMain.handle('workspace:get-project', () => projectPath)
ipcMain.handle('workspace:get-main', () => mainDirectory())
ipcMain.handle('workspace:choose-project', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { defaultPath: projectPath || undefined, properties: ['openDirectory', 'createDirectory'] })
  return result.canceled ? projectPath : setProject(result.filePaths[0])
})
ipcMain.handle('workspace:list-projects', () => projectsStore.list())
ipcMain.handle('workspace:open-project', async (_event, directory) => {
  const target = path.resolve(String(directory || ''))
  if (!(await fs.stat(target).then((stat) => stat.isDirectory(), () => false))) throw new Error(t('The project folder no longer exists'))
  return setProject(target)
})
// Crea una cartella di progetto con il nome dato: la posizione si sceglie con la finestra di sistema.
ipcMain.handle('workspace:create-project', async (_event, name) => {
  const folderName = String(name || '').trim()
  if (!folderName || /[\\/:*?"<>|]/.test(folderName) || folderName === '.' || folderName === '..') throw new Error(t('Invalid name'))
  const result = await dialog.showOpenDialog(mainWindow, { title: t('Choose where to create the project'), defaultPath: path.dirname(projectPath || app.getPath('documents')), properties: ['openDirectory', 'createDirectory'] })
  if (result.canceled) return null
  const target = path.join(result.filePaths[0], folderName)
  if (fsSync.existsSync(target)) throw new Error(t('An item with this name already exists'))
  await fs.mkdir(target)
  return setProject(target)
})
// Per l'assistente: crea un progetto nuovo (con l'OK dell'utente e la scelta della cartella) e vi collega i documenti indicati, senza copiarli.
// Non cambia progetto: lo fa il renderer, che prima salva la sessione corrente.
ipcMain.handle('tools:create-project', async (_event, { name, documents } = {}) => {
  const folderName = String(name || '').trim()
  if (!folderName || /[\\/:*?"<>|]/.test(folderName) || folderName === '.' || folderName === '..') throw new Error(t('Invalid name'))
  const linked = checkedPaths(null, documents)
  const listed = linked.map((file) => `• ${file}`).join('\n')
  const confirmed = await confirmInApp({
    message: t('The assistant wants to create the project "{name}"', { name: folderName }),
    detail: [
      linked.length ? `${t('These documents will be linked to it, not copied: any change goes to the original files, where they are now.')}\n${listed}` : t('No documents will be linked.'),
      t('The app will open the new project and the conversation will continue there.'),
    ].join('\n\n'),
    confirmLabel: t('Choose the folder…'),
  })
  if (!confirmed) return null
  const picked = await dialog.showOpenDialog(mainWindow, { title: t('Choose where to create the project'), defaultPath: app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return null
  const target = path.join(picked.filePaths[0], folderName)
  if (fsSync.existsSync(target)) throw new Error(t('An item with this name already exists'))
  await fs.mkdir(target)
  return { path: target, links: writeLinksTo(target, linked) }
})
ipcMain.handle('references:list', () => (projectPath ? referencesStore.list() : []))
// Riferimenti web (la stellina del browser): pagine salvate con una copia in Markdown in `.ow/web` (vedi web-references.cjs). Salvare o togliere una pagina riallinea
// subito la ricerca: la cartella `.ow/web` è la cartella di riferimento automatica `@web`.
async function webReferencesChanged() {
  watchReferences()
  if (!knowledgeOn || !projectPath) return
  const folder = webStore.folder()
  if (webFolderOf(projectPath)) knowledge.sync(folder).catch(() => {}); else knowledge.clear(folder).catch(() => {})
  configureSemantic()
}
ipcMain.handle('webrefs:list', () => (projectPath ? webStore.list() : []))
ipcMain.handle('webrefs:find', (_event, url) => (projectPath ? webStore.find(String(url || '')) : null))
ipcMain.handle('webrefs:save', async (_event, page = {}) => {
  const entry = webStore.save({ url: String(page.url || ''), title: String(page.title || ''), markdown: String(page.markdown || ''), siteName: String(page.siteName || ''), source: String(page.source || 'user'), checkOnly: page.checkOnly === true })
  await webReferencesChanged()
  return entry
})
ipcMain.handle('webrefs:remove', async (_event, id) => {
  const list = webStore.remove(String(id || ''))
  await webReferencesChanged()
  return list
})
// Aggiunge una cartella di riferimento: si sceglie col dialogo (o, per il trascinamento, si passa il percorso).
ipcMain.handle('references:add', async (_event, directory) => {
  if (!projectPath) throw new Error(t('No project open'))
  let chosen = directory
  if (!chosen) {
    const result = await dialog.showOpenDialog(mainWindow, { title: t('Choose a reference folder'), properties: ['openDirectory'] })
    if (result.canceled || !result.filePaths[0]) return null
    chosen = result.filePaths[0]
  }
  const added = referencesStore.add(chosen)
  startKnowledge()
  return added
})
// Ricollega un riferimento (di solito perché la cartella è stata spostata o rinominata): si sceglie la nuova posizione, la sigla non cambia.
ipcMain.handle('references:update', async (_event, name) => {
  const reference = referencesStore.get(String(name))
  if (!reference) throw new Error(t('Reference not found'))
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('Choose the folder this reference should point to'),
    defaultPath: fsSync.existsSync(path.dirname(reference.path)) ? path.dirname(reference.path) : undefined,
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const updated = referencesStore.update(reference.name, result.filePaths[0])
  knowledge.clear(reference.path).catch(() => {})
  startKnowledge()
  return updated
})
ipcMain.handle('references:remove', (_event, name) => {
  const reference = referencesStore.get(String(name))
  const remaining = referencesStore.remove(String(name))
  // Le voci della cartella escono dall'indice (se un altro progetto la usa ancora, si rifanno alla sua prossima apertura).
  if (reference) knowledge.clear(reference.path).catch(() => {})
  watchReferences()
  return remaining
})
ipcMain.handle('references:reveal', async (_event, name) => {
  const reference = referencesStore.get(String(name))
  if (!reference || !fsSync.existsSync(reference.path)) throw new Error(t('Folder not found'))
  const failure = await shell.openPath(reference.path)
  if (failure) throw new Error(failure)
})
ipcMain.handle('links:list', () => (projectPath ? linksStore.list() : []))
ipcMain.handle('links:remove', (_event, target) => linksStore.remove(target))
// Aggiorna un collegamento: si sceglie il file a cui deve puntare (di solito lo stesso documento, spostato o rinominato).
ipcMain.handle('links:update', async (_event, target) => {
  if (!linksStore.has(String(target))) throw new Error(t('Link not found'))
  const result = await dialog.showOpenDialog(mainWindow, {
    title: t('Choose the file this link should point to'),
    defaultPath: fsSync.existsSync(path.dirname(String(target))) ? path.dirname(String(target)) : undefined,
    properties: ['openFile'],
    filters: [markdownFilter],
  })
  if (result.canceled || !result.filePaths[0]) return null
  return linksStore.update(String(target), result.filePaths[0])
})
ipcMain.handle('links:reveal', (_event, target) => {
  if (!linksStore.has(String(target)) || !fsSync.existsSync(String(target))) throw new Error(t('File not found'))
  shell.showItemInFolder(path.resolve(String(target)))
})
ipcMain.handle('chat:copy-to-project', (_event, { id, target } = {}) => chatStore.copyTo(String(id || ''), String(target || '')))
ipcMain.handle('workspace:remove-project', (_event, directory) => { projectsStore.remove(String(directory || '')); return projectsStore.list() })
// Per l'assistente: sposta nel cestino (con la conferma dell'utente) o sposta/rinomina dentro il progetto.
ipcMain.handle('memory:list', () => memoryStore.list())
ipcMain.handle('memory:add', (_event, entry) => memoryStore.add(entry))
ipcMain.handle('memory:update', (_event, { id, changes } = {}) => memoryStore.update(id, changes))
ipcMain.handle('memory:delete', (_event, id) => memoryStore.remove(id))
ipcMain.handle('tools:delete-path', async (_event, relativePath) => {
  const { target, relative } = projectTools.resolvePath(relativePath)
  if (!relative) throw new Error(t('The project folder cannot be deleted from here'))
  if (!fsSync.existsSync(target)) throw new Error(t('This path is not accessible'))
  const deleted = await deletePath(target)
  return { deleted: Boolean(deleted), also: deleted ? deleted.slice(1) : [], absolute: target, path: relative }
})
ipcMain.handle('tools:move-path', async (_event, { from, to } = {}) => {
  const source = projectTools.resolvePath(from)
  const destination = projectTools.resolvePath(to)
  if (!source.relative || !destination.relative) throw new Error(t('Invalid name'))
  if (!fsSync.existsSync(source.target)) throw new Error(t('This path is not accessible'))
  if (fsSync.existsSync(destination.target)) throw new Error(t('An item with this name already exists'))
  const imagePlan = planImageMove(source.target, destination.target, imageScanOptions())
  await fs.mkdir(path.dirname(destination.target), { recursive: true })
  await fs.rename(source.target, destination.target)
  moveArtifacts(source.target, destination.target)
  applyImageMove(imagePlan)
  return { from: source.target, to: destination.target, path: destination.relative }
})
ipcMain.handle('tools:create-directory', (_event, relativePath) => projectTools.createDirectory(relativePath))
ipcMain.handle('tools:create-file', (_event, { path: relativePath, content } = {}) => projectTools.createFile(relativePath, content))
// Dal file manager: nuova cartella o nuovo documento Markdown vuoto dentro `parent`; restituisce il percorso assoluto creato.
ipcMain.handle('workspace:create-entry', async (_event, { parent, name, type } = {}) => {
  const base = resolveInProject(parent)
  const clean = String(name || '').trim()
  if (!clean || clean === '.' || clean === '..' || /[\\/:*?"<>|]/.test(clean)) throw new Error(t('Invalid name'))
  const relative = path.relative(projectPath, path.join(base, clean)).split(path.sep).join('/')
  const directory = type === 'directory'
  const final = directory || path.extname(clean) ? relative : `${relative}.md`
  if (fsSync.existsSync(path.join(projectPath, final))) throw new Error(t('An item with this name already exists'))
  // Dall'albero il nome lo sceglie l'utente: lo stesso nome in un'altra cartella è lecito (README.md, index.md…); il controllo sui doppioni vale per l'assistente.
  return (directory ? await projectTools.createDirectory(final) : await projectTools.createFile(final, '')).absolute
})
ipcMain.handle('app:open-link', (_event, url) => (/^https?:\/\//i.test(String(url)) ? shell.openExternal(String(url)) : false))
ipcMain.handle('images:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { defaultPath: projectPath || undefined, properties: ['openFile'], filters: [{ name: t('Image'), extensions: IMAGE_EXTENSIONS.map((extension) => extension.slice(1)) }] })
  return result.canceled ? null : result.filePaths[0]
})
// Porta un'immagine (file esistente o dati incollati) accanto al documento, nella sua sottocartella images/, e restituisce il percorso assoluto.
// Così l'immagine resta nel progetto (e si sposta con lui) invece di puntare a un file fuori.
ipcMain.handle('images:import', async (_event, { documentPath, sourcePath, data, mime, name } = {}) => {
  if (!documentPath || !path.isAbsolute(String(documentPath))) throw new Error(t('Save the document first to add images'))
  const fromMime = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp' }[mime]
  const extension = (sourcePath ? path.extname(sourcePath) : fromMime || '').toLowerCase()
  if (!IMAGE_EXTENSIONS.includes(extension)) throw new Error(t('Unsupported format: png, jpg, gif, webp and bmp are allowed'))
  const directory = path.join(path.dirname(path.resolve(String(documentPath))), 'images')
  await fs.mkdir(directory, { recursive: true })
  const base = (sourcePath ? path.basename(sourcePath, extension) : String(name || '').replace(/\.[^.]*$/, '') || `image-${Date.now()}`).replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'image'
  let target = path.join(directory, `${base}${extension}`)
  for (let counter = 2; fsSync.existsSync(target); counter += 1) target = path.join(directory, `${base}-${counter}${extension}`)
  if (sourcePath) await fs.copyFile(sourcePath, target)
  else await fs.writeFile(target, Buffer.from(String(data || ''), 'base64'))
  return target
})
ipcMain.handle('workspace:import-files', (_event, request) => importFiles(request || {}))
ipcMain.handle('edit:action', (event, action) => {
  const contents = event.sender
  if (action === 'cut') contents.cut()
  else if (action === 'copy') contents.copy()
  else if (action === 'paste') contents.paste()
  else if (action === 'selectAll') contents.selectAll()
})
ipcMain.handle('edit:replace-misspelling', (event, text) => event.sender.replaceMisspelling(String(text)))
ipcMain.handle('edit:add-dictionary', (event, word) => event.sender.session.addWordToSpellCheckerDictionary(String(word)))
ipcMain.handle('workspace:rename-path', (_event, request) => renamePath(request || {}))
ipcMain.handle('workspace:delete-path', (_event, target) => deletePath(target))
ipcMain.handle('workspace:delete-paths', (_event, targets) => deletePaths(targets))
ipcMain.handle('workspace:open-project-folder', async () => { if (!projectPath) throw new Error(t('No project open')); const failure = await shell.openPath(projectPath); if (failure) throw new Error(failure) })
// Trasforma una cartella del progetto in sotto-progetto: crea la sua `.ow` (impostazioni e contesto vuoti). Solo su richiesta esplicita dell'utente.
ipcMain.handle('workspace:create-subproject', async (_event, directory) => {
  const target = resolveInProject(directory)
  if (target === projectPath) throw new Error(t('The project folder is already a project'))
  if (!(await fs.stat(target).then((stat) => stat.isDirectory(), () => false))) throw new Error(t('Not a folder'))
  if (fsSync.existsSync(path.join(target, projectFile.directoryName))) throw new Error(t('This folder is already a project'))
  // Nasce che eredita il contesto del progetto padre; si può togliere dalle impostazioni del sotto-progetto.
  createProjectFile({ getProjectPath: () => target }).initialize({ inherit: true })
  return target
})
// Sposta una cartella (rename; tra dischi diversi la copia e poi toglie l'originale).
async function moveDirectory(source, destination) {
  try {
    await fs.rename(source, destination)
  } catch (error) {
    if (error.code !== 'EXDEV') throw error
    await fs.cp(source, destination, { recursive: true, errorOnExist: true, force: false })
    await fs.rm(source, { recursive: true, force: true })
  }
}

const isInsideOf = isSameOrInside

// Cambia solo l'eredità del contesto di un progetto (le altre impostazioni e il contesto restano come sono).
function setInheritance(directory, inherit) {
  const file = createProjectFile({ getProjectPath: () => directory })
  const current = file.getSettings()
  file.saveSettings({ name: current.name, ai: { context: current.ai.context, language: current.ai.language, documentLanguage: current.ai.documentLanguage }, options: current.options, spellcheck: current.spellcheck, inherit })
}

// Sotto-progetto → progetto autonomo: la cartella, con la sua `.ow` (cronologia, note, memoria dei suoi file), esce dal progetto aperto
// e va nella cartella scelta. Diventa un progetto a sé, che non eredita più il contesto di nessun altro.
ipcMain.handle('workspace:move-subproject-out', async (_event, subproject) => {
  const source = resolveInProject(subproject)
  if (source === projectPath) throw new Error(t('The project folder cannot be renamed from here'))
  if (!fsSync.existsSync(path.join(source, projectFile.directoryName))) throw new Error(t('This folder is not a sub-project'))
  const confirmed = await confirmInApp({
    message: t('Make the sub-project "{name}" a standalone project?', { name: path.basename(source) }),
    detail: t('The folder is moved out of this project to the place you choose, with its history, notes and memory. It will no longer inherit the instructions of this project.'),
    confirmLabel: t('Choose the destination…'),
  })
  if (!confirmed) return null
  const picked = await dialog.showOpenDialog(mainWindow, { title: t('Choose where to move the project'), defaultPath: path.dirname(projectPath), properties: ['openDirectory', 'createDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return null
  const parent = path.resolve(picked.filePaths[0])
  if (isInsideOf(projectPath, parent)) throw new Error(t('Choose a folder outside this project'))
  const target = path.join(parent, path.basename(source))
  if (fsSync.existsSync(target)) throw new Error(t('An item with this name already exists'))
  await moveDirectory(source, target)
  try { setInheritance(target, false) } catch (error) { console.error('Eredità non aggiornata:', error) }
  projectsStore.touch(target)
  return target
})

// Progetto autonomo → sotto-progetto: la cartella di un altro progetto (scelta dall'utente) viene spostata dentro `directory`, una cartella
// del progetto aperto, portandosi dietro la sua `.ow`. Da lì in poi eredita il contesto di questo progetto (si toglie dalle sue impostazioni).
ipcMain.handle('workspace:move-project-in', async (_event, directory) => {
  const destination = resolveInProject(directory)
  if (!(await fs.stat(destination).then((stat) => stat.isDirectory(), () => false))) throw new Error(t('Not a folder'))
  const picked = await dialog.showOpenDialog(mainWindow, { title: t('Choose the project to move here'), defaultPath: path.dirname(projectPath), properties: ['openDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return null
  const source = path.resolve(picked.filePaths[0])
  if (!fsSync.existsSync(path.join(source, projectFile.directoryName))) throw new Error(t('This folder is not a project: it has no .ow folder'))
  if (isInsideOf(source, projectPath)) throw new Error(t('The open project cannot be moved into itself'))
  if (isInsideOf(projectPath, source)) throw new Error(t('This folder is already inside the open project'))
  const target = path.join(destination, path.basename(source))
  if (fsSync.existsSync(target)) throw new Error(t('An item with this name already exists'))
  const confirmed = await confirmInApp({
    message: t('Move the project "{name}" into this project?', { name: path.basename(source) }),
    detail: t('The folder is moved (not copied) to {destination} and becomes a sub-project, with its history, notes and memory. It will inherit the instructions of this project, unless you change it in its settings.', { destination }),
    confirmLabel: t('Move'),
  })
  if (!confirmed) return null
  await moveDirectory(source, target)
  try { setInheritance(target, true) } catch (error) { console.error('Eredità non aggiornata:', error) }
  projectsStore.remove(source)
  return target
})
// Sposta un progetto (anche non aperto) in un'altra cartella: l'elenco dei progetti e le sessioni seguono la nuova posizione.
// Se è il progetto aperto, resta aperto nel nuovo posto (l'interfaccia ricarica la sessione, che ora ha i percorsi aggiornati).
ipcMain.handle('workspace:move-project', async (_event, directory) => {
  const source = path.resolve(String(directory || ''))
  if (!(await fs.stat(source).then((stat) => stat.isDirectory(), () => false))) throw new Error(t('The project folder no longer exists'))
  const confirmed = await confirmInApp({
    message: t('Move the project "{name}"?', { name: path.basename(source) }),
    detail: t('The whole folder is moved to the place you choose, with its history, notes and memory.'),
    confirmLabel: t('Choose the destination…'),
  })
  if (!confirmed) return null
  const picked = await dialog.showOpenDialog(mainWindow, { title: t('Choose where to move the project'), defaultPath: path.dirname(source), properties: ['openDirectory', 'createDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return null
  const parent = path.resolve(picked.filePaths[0])
  if (isInsideOf(source, parent)) throw new Error(t('Choose a folder outside the project'))
  const target = path.join(parent, path.basename(source))
  if (samePath(target, source)) return null
  if (fsSync.existsSync(target)) throw new Error(t('An item with this name already exists'))
  const wasOpen = Boolean(projectPath) && path.resolve(projectPath).toLowerCase() === source.toLowerCase()
  await moveDirectory(source, target)
  projectsStore.replace(source, target)
  try { moveSessions(source, target) } catch (error) { console.error('Sessioni non aggiornate:', error) }
  if (wasOpen) await setProject(target)
  return { path: target, wasOpen }
})
// Mostra nel file manager la cartella di un progetto dell'elenco.
ipcMain.handle('projects:reveal', (_event, directory) => {
  const target = path.resolve(String(directory || ''))
  if (!projectsStore.list().some((item) => path.resolve(item.path).toLowerCase() === target.toLowerCase()) || !fsSync.existsSync(target)) throw new Error(t('The project folder no longer exists'))
  shell.openPath(target)
})
// Trascinamento in uscita: l'elemento (file o cartella del progetto, o documento collegato) parte come trascinamento nativo del sistema,
// così si può rilasciare in un'altra applicazione o nel file manager. Solo percorsi del progetto o collegati.
ipcMain.on('workspace:start-drag', (event, targets) => {
  try {
    const chosen = (Array.isArray(targets) ? targets : [targets]).slice(0, 50).map((item) => (linksStore.has(String(item)) ? path.resolve(String(item)) : resolveInProject(String(item)))).filter((item) => fsSync.existsSync(item))
    // Un documento Markdown porta con sé il suo originale (DOCX/PDF).
    const files = [...new Set(chosen.flatMap((item) => [item, ...originalsOf(item)]))]
    if (!files.length) return
    const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 32, height: 32 })
    event.sender.startDrag(files.length > 1 ? { files, icon } : { file: files[0], icon })
  } catch (error) {
    console.error('Trascinamento non avviato:', error.message)
  }
})
ipcMain.handle('workspace:move-path', (_event, request) => moveIntoDirectory(request || {}))
// Dimensione e data di un file del progetto (per la scheda di visualizzazione di un'immagine).
ipcMain.handle('workspace:file-info', async (_event, target) => {
  const stats = await fs.stat(resolveInProject(target))
  return { size: stats.size, modified: Math.round(stats.mtimeMs) }
})
ipcMain.handle('workspace:reveal-path', (_event, target) => { shell.showItemInFolder(resolveInProject(target)) })
ipcMain.handle('workspace:list-directory', (_event, directory) => listDirectory(directory))
// Tutti i documenti Markdown del progetto (percorsi assoluti), per proporli mentre si scrive un collegamento.
const MAX_LINKABLE_DOCUMENTS = 5000
ipcMain.handle('workspace:list-documents', async () => {
  if (!projectPath) return []
  const found = []
  const walk = async (directory) => {
    let entries
    try { entries = await fs.readdir(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (found.length >= MAX_LINKABLE_DOCUMENTS) return
      if (entry.name.startsWith('.')) continue
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        if (!hiddenDirectories.has(entry.name)) await walk(full)
      } else if (['.md', '.markdown', '.mdown'].includes(path.extname(entry.name).toLowerCase())) {
        found.push(full)
      }
    }
  }
  await walk(projectPath)
  return found
})
// Le immagini incorporate nel testo (data:, per esempio quelle di un PDF o di un DOCX aperto) diventano file nella cartella images/ accanto al documento:
// il Markdown resta leggibile e le immagini seguono il documento. Il nome deriva dal contenuto, quindi salvare più volte non crea doppioni.
const EMBEDDED_DESTINATION = /^data:image\/(png|jpe?g|gif|webp|bmp);base64,([A-Za-z0-9+/=]+)$/

// Si guardano i token immagine del documento (non il testo grezzo): un esempio dentro un blocco di codice o tra apici inversi non si tocca.
async function externalizeImages(markdown, markdownPath) {
  const embedded = findImages(markdown).filter((image) => image.destination && EMBEDDED_DESTINATION.test(image.destination.value))
  if (!embedded.length) return markdown
  const directory = path.join(path.dirname(markdownPath), 'images')
  const stem = path.basename(markdownPath).replace(/\.[^.]*$/, '').replace(/[^\p{L}\p{N}._-]+/gu, '-').replace(/^-+|-+$/g, '') || 'image'
  const names = new Map()
  for (const image of embedded) {
    const [, type, data] = EMBEDDED_DESTINATION.exec(image.destination.value)
    if (names.has(data)) continue
    const buffer = Buffer.from(data, 'base64')
    const extension = type === 'jpeg' ? 'jpg' : type
    const name = `${stem}-${require('node:crypto').createHash('sha1').update(buffer).digest('hex').slice(0, 8)}.${extension}`
    await fs.mkdir(directory, { recursive: true })
    const target = path.join(directory, name)
    if (!fsSync.existsSync(target)) await fs.writeFile(target, buffer)
    names.set(data, name)
  }
  return rewriteImageDestinations(markdown, (image) => {
    const match = image.destination && EMBEDDED_DESTINATION.exec(image.destination.value)
    return match ? `images/${names.get(match[2])}` : null
  })
}

ipcMain.handle('document:save-markdown', async (_event, { filePath, markdown, saveAs, defaultName }) => {
  const targetPath = await chooseSavePath({
    filePath,
    saveAs,
    // `defaultName` (es. il titolo di un articolo salvato dal browser): propone quel nome nella cartella del progetto.
    defaultPath: startingPath(`${defaultName ? path.basename(String(defaultName)) : t('New document')}.md`),
    filters: [markdownFilter],
  })
  if (!targetPath) return null
  const markdownPath = /\.(md|markdown|mdown)$/i.test(targetPath) ? targetPath : `${targetPath}.md`
  markdown = await externalizeImages(markdown, markdownPath)
  await fs.writeFile(markdownPath, markdown, 'utf8')
  // La cronologia non deve mai far fallire il salvataggio.
  try {
    if (projectFile.autoVersionsEnabled(markdownPath)) projectFile.addVersion(markdownPath, markdown, { auto: true })
  } catch (error) {
    console.error('Versione non salvata:', error)
  }
  return markdownPath
})
// Nome proposto per un'esportazione: il titolo del documento (senza estensione né caratteri non ammessi), o "Nuovo documento".
const exportName = (name) => String(name || '').replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim() || t('New document')
ipcMain.handle('document:export-docx', async (_event, { html, documentPath, name }) => {
  const targetPath = await chooseSavePath({
    defaultPath: startingPath(`${exportName(name)}.docx`, documentPath),
    filters: [{ name: 'Word', extensions: ['docx'] }],
  })
  if (!targetPath) return null
  const docxPath = /\.docx$/i.test(targetPath) ? targetPath : `${targetPath}.docx`
  // Caricato solo all'esportazione: html-to-docx dipende da un modulo che emette l'avviso di deprecazione di punycode.
  const htmlToDocx = require('html-to-docx')
  const document = await htmlToDocx(`<html><body>${html}</body></html>`, null, { title: t('New document') })
  await fs.writeFile(docxPath, document)
  return docxPath
})
// Markdown con le immagini incorporate (data: URI): un solo file .md, senza la cartella images/ né uno zip. Il documento originale non cambia.
ipcMain.handle('document:export-markdown-embedded', async (_event, { markdown, documentPath, name } = {}) => {
  const base = String(name || '').replace(/\.[^.]*$/, '').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim() || t('New document')
  const targetPath = await chooseSavePath({
    defaultPath: startingPath(`${base} (embedded).md`, documentPath),
    filters: [markdownFilter],
  })
  if (!targetPath) return null
  const markdownPath = /\.(md|markdown|mdown)$/i.test(targetPath) ? targetPath : `${targetPath}.md`
  const result = embedImages(String(markdown || ''), documentPath ? String(documentPath) : null)
  await fs.writeFile(markdownPath, result.markdown, 'utf8')
  return { path: markdownPath, embedded: result.embedded, missing: result.missing.length, tooLarge: result.tooLarge.length, remote: result.remote }
})
// L'inverso: da un Markdown con le immagini incorporate si ricava un .md leggero e le immagini in images/ accanto. Si lavora sul file su disco (anche decine
// di MB), senza passare dall'editor; il file originale non cambia. `source`: il file da convertire (altrimenti si sceglie).
ipcMain.handle('document:extract-markdown-images', async (_event, { source, directory } = {}) => {
  let file = source ? String(source) : null
  if (!file) {
    const picked = await dialog.showOpenDialog(mainWindow, { title: t('Markdown file with embedded images'), defaultPath: directory || projectPath || undefined, properties: ['openFile'], filters: [markdownFilter] })
    if (picked.canceled || !picked.filePaths[0]) return null
    file = picked.filePaths[0]
  }
  const base = path.basename(file).replace(/\.[^.]*$/, '')
  const text = await fs.readFile(file, 'utf8')
  if (!/data:image\/(png|jpe?g|gif|webp|bmp);base64,/i.test(text)) return { path: null, count: 0 }
  const targetPath = await chooseSavePath({ defaultPath: path.join(path.dirname(file), `${base} (linked images).md`), filters: [markdownFilter] })
  if (!targetPath) return null
  const markdownPath = /\.(md|markdown|mdown)$/i.test(targetPath) ? targetPath : `${targetPath}.md`
  if (path.resolve(markdownPath).toLowerCase() === path.resolve(file).toLowerCase()) throw new Error(t('Choose a different file: the original is not modified'))
  // Il lavoro blocca questo processo per un po': prima si avvisa la finestra (che ha un processo suo) perché mostri l'attesa.
  mainWindow.webContents.send('document:extract-markdown-images-start', { name: path.basename(file), size: (text.length / 1048576).toFixed(1) })
  await new Promise((resolve) => setTimeout(resolve, 60))
  const result = extractImages(text, { directory: path.join(path.dirname(markdownPath), 'images'), stem: base })
  await fs.writeFile(markdownPath, result.markdown, 'utf8')
  return { path: markdownPath, count: result.count, bytes: result.bytes }
})
ipcMain.handle('document:print', (_event, { html }) => printDocument(String(html || '')))
ipcMain.handle('document:export-pdf', async (_event, { html, documentPath, name }) => {
  const targetPath = await chooseSavePath({
    defaultPath: startingPath(`${exportName(name)}.pdf`, documentPath),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
  if (!targetPath) return null
  const pdfPath = /\.pdf$/i.test(targetPath) ? targetPath : `${targetPath}.pdf`
  await exportPdf(html, pdfPath)
  return pdfPath
})
ipcMain.handle('ai:get-settings', () => aiProviders.getSettings())
ipcMain.handle('ai:save-settings', (_event, settings) => aiProviders.saveSettings(settings))
ipcMain.handle('ai:status', (_event, provider) => aiProviders.getStatus(provider))
ipcMain.handle('ai:login', (_event, provider) => aiProviders.login(provider, {
  openExternal: (url) => (/^https:\/\//.test(url) ? shell.openExternal(url) : false),
}))
ipcMain.handle('ai:login-code', (_event, code) => aiProviders.submitLoginCode(code))
ipcMain.handle('ai:models', (_event, request) => aiProviders.listModels(request || {}))
ipcMain.handle('ai:model-inputs', (_event, request) => aiProviders.listModelInputs(request || {}))
ipcMain.handle('ai:has-api-key', (_event, provider) => aiProviders.hasApiKey(provider))
ipcMain.handle('ai:save-api-key', (_event, value, provider) => aiProviders.saveApiKey(value, provider))
ipcMain.handle('ai:chat', (_event, messages) => aiProviders.chat(messages))

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) contents.loadURL(url)
    return { action: 'deny' }
  })
  contents.on('will-navigate', (event, url) => { if (!/^(https?:|about:blank)/i.test(url)) event.preventDefault() })
})

// Lingua del processo principale: ricordata tra gli avvii, così il menu nasce già nella lingua giusta.
const languageFilePath = () => path.join(app.getPath('userData'), 'language.json')

function loadLanguage() {
  try { setLocale(JSON.parse(fsSync.readFileSync(languageFilePath(), 'utf8')).locale) } catch { /* prima esecuzione: inglese */ }
}

// Modalità di visualizzazione dei documenti (la sceglie l'interfaccia): serve al menu Visualizza per mostrare la voce attiva.
let viewMode = 'endless'
// La Home dei progetti è aperta: il menu disattiva le voci che agiscono sul documento (che non si vede).
let homeOpen = false
ipcMain.on('home:changed', (_event, open) => {
  if (Boolean(open) === homeOpen) return
  homeOpen = Boolean(open)
  buildMenu()
})

function buildMenu() {
  createApplicationMenu((command) => {
    if (['settings', 'open-project', 'about', 'check-updates', 'view-endless', 'view-pages'].includes(command)) mainWindow?.webContents.send('app:command', command)
    else mainWindow?.webContents.send('document:command', command)
  }, { view: viewMode, home: homeOpen })
}

ipcMain.on('view:changed', (_event, mode) => {
  if ((mode !== 'endless' && mode !== 'pages') || mode === viewMode) return
  viewMode = mode
  buildMenu()
})

// Caratteri scelti dal catalogo Google Fonts: scaricati una volta sola e salvati nei dati dell'app.
const fontsStore = createFontsStore({ directory: path.join(app.getPath('userData'), 'fonts') })
ipcMain.handle('fonts:catalog', () => fontsStore.catalog())
ipcMain.handle('fonts:list', () => fontsStore.list())
ipcMain.handle('fonts:install', (_event, family) => fontsStore.install(String(family)))
ipcMain.handle('fonts:remove', (_event, family) => fontsStore.remove(family))

// Preferenze dell'interfaccia (tema, lingua, layout…): un file nei dati dell'app, così non dipendono dall'indirizzo da cui si carica la pagina
// (il localStorage del browser cambia tra sviluppo e app installata). Il renderer le legge all'avvio in modo sincrono, per non far lampeggiare il tema.
const preferencesPath = () => path.join(app.getPath('userData'), 'preferences.json')
let preferences = null
let preferencesTimer = null

function loadPreferences() {
  if (preferences) return preferences
  try {
    const parsed = JSON.parse(fsSync.readFileSync(preferencesPath(), 'utf8'))
    preferences = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    preferences = {}
  }
  return preferences
}

function flushPreferences() {
  clearTimeout(preferencesTimer)
  preferencesTimer = null
  if (!preferences) return
  try {
    fsSync.mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileAtomic(preferencesPath(), JSON.stringify(preferences, null, 2))
  } catch (error) {
    console.error('Preferenze non salvate:', error.message)
  }
}

ipcMain.on('preferences:load', (event) => { event.returnValue = loadPreferences() })
function setPreferenceValue(key, value) {
  if (typeof key !== 'string' || !/^openwriter\.[A-Za-z0-9.]{1,60}$/.test(key) || typeof value !== 'string' || value.length > 20000) return
  loadPreferences()[key] = value
  clearTimeout(preferencesTimer)
  preferencesTimer = setTimeout(flushPreferences, 200)
}
ipcMain.on('preferences:set', (_event, key, value) => setPreferenceValue(key, value))
app.on('before-quit', flushPreferences)

// Appunti di file con il sistema: copia/taglia dall'albero e incolla nel file manager o in altri programmi, e viceversa (vedi file-clipboard.cjs).
const CLIPBOARD_IGNORED = new Set(['.ow', '.git', 'node_modules'])
ipcMain.handle('clipboard:copy-files', async (_event, { paths, cut } = {}) => {
  const resolved = (Array.isArray(paths) ? paths : [paths]).map((item) => resolveInProject(String(item)))
  if (!resolved.length || resolved.includes(path.resolve(projectPath))) throw new Error(t('The project folder cannot be renamed from here'))
  // Un documento Markdown porta con sé il suo originale (DOCX/PDF): negli appunti vanno insieme.
  const withOriginals = [...new Set(resolved.flatMap((item) => [item, ...originalsOf(item)]))]
  await fileClipboard.write(withOriginals, cut ? 'cut' : 'copy')
  return resolved.length
})
// Incolla gli appunti di file nella cartella indicata. Quel che viene dal progetto e si è tagliato si sposta (cronologia, note e memoria lo seguono);
// il resto si copia: un "taglia" fatto in un altro programma lascia l'originale dov'è (non si cancella mai nulla fuori dal progetto).
ipcMain.handle('clipboard:paste-files', async (_event, { targetDirectory } = {}) => {
  const directory = resolveInProject(targetDirectory)
  if (!(await fs.stat(directory).then((stat) => stat.isDirectory(), () => false))) throw new Error(t('The destination is not a folder'))
  const clip = await fileClipboard.read()
  const result = { empty: !clip, copied: [], moved: [], skipped: 0, externalCut: false }
  if (!clip) return result
  const listed = clip.paths.map((item) => path.resolve(item))
  // Un originale (DOCX/PDF) elencato insieme al suo documento Markdown segue il documento: non si tratta a parte.
  const followsMarkdown = (item) => convertibleExtensions.includes(path.extname(item).toLowerCase()) && listed.some((other) => other !== item && path.extname(other).toLowerCase() === '.md' && originalsOf(other).includes(item))
  for (const given of clip.paths.slice(0, 200)) {
    try {
      const source = path.resolve(given)
      if (followsMarkdown(source)) continue
      const stats = await fs.stat(source)
      const inside = !path.relative(projectPath, source).startsWith('..') && !path.isAbsolute(path.relative(projectPath, source)) && source !== path.resolve(projectPath)
      if (inside && clip.cut) {
        const companions = originalsOf(source)
        const to = await moveIntoDirectory({ from: source, toDirectory: directory })
        if (to !== source) {
          result.moved.push({ from: source, to })
          for (const item of companions) result.moved.push({ from: item, to: path.join(directory, path.basename(item)) })
        }
        continue
      }
      if (clip.cut) result.externalCut = true
      if (stats.isDirectory()) {
        if (directory === source || directory.startsWith(source + path.sep) || CLIPBOARD_IGNORED.has(path.basename(source))) { result.skipped += 1; continue }
        const destination = await uniqueDestination(directory, path.basename(source))
        await fs.cp(source, destination, { recursive: true, errorOnExist: true, filter: (item) => !CLIPBOARD_IGNORED.has(path.basename(item)) })
        result.copied.push(destination)
      } else if (listedExtensions.includes(path.extname(source).toLowerCase())) {
        const destination = await uniqueDestination(directory, path.basename(source))
        await fs.copyFile(source, destination, fsSync.constants.COPYFILE_EXCL)
        result.copied.push(destination)
        // Gli originali (DOCX/PDF) si copiano con il nuovo nome del documento.
        const newStem = path.basename(destination, path.extname(destination))
        for (const item of originalsOf(source)) {
          const target = path.join(directory, `${newStem}${path.extname(item)}`)
          if (!fsSync.existsSync(target)) await fs.copyFile(item, target, fsSync.constants.COPYFILE_EXCL)
        }
      } else {
        result.skipped += 1
      }
    } catch {
      result.skipped += 1
    }
  }
  return result
})

// Cambiamenti nella cartella del progetto fatti da fuori (file incollati, creati, spostati o eliminati con altri programmi): l'albero si aggiorna da solo.
let workspaceWatcher = null
let workspaceWatchTimer = null
let annotationsWatchTimer = null
function stopWorkspaceWatch() {
  clearTimeout(workspaceWatchTimer)
  clearTimeout(annotationsWatchTimer)
  try { workspaceWatcher?.close() } catch { /* già chiuso */ }
  workspaceWatcher = null
  stopReferenceWatch()
}
ipcMain.handle('workspace:watch', () => {
  stopWorkspaceWatch()
  if (!projectPath) return false
  try {
    workspaceWatcher = fsSync.watch(projectPath, { recursive: true }, (_event, name) => {
      const parts = name ? String(name).split(/[\\/]/) : []
      // Note e segnalibri scritti da altri programmi (per esempio l'agente tramite il server MCP): l'interfaccia li rilegge.
      const owner = parts.indexOf('.ow')
      if (owner !== -1 && (parts[owner + 1] === 'notes' || parts[owner + 1] === 'bookmarks')) {
        clearTimeout(annotationsWatchTimer)
        annotationsWatchTimer = setTimeout(() => mainWindow?.webContents.send('workspace:annotations-changed'), 300)
        return
      }
      if (parts.some((part) => CLIPBOARD_IGNORED.has(part))) return
      // Senza nome del file il sistema non dice cosa è cambiato: riscansione completa. Altrimenti si aggiorna solo quel percorso.
      if (knowledgeOn) knowledge.changed(projectPath, name ? [parts.join('/')] : null)
      clearTimeout(workspaceWatchTimer)
      workspaceWatchTimer = setTimeout(() => mainWindow?.webContents.send('workspace:changed'), 400)
    })
    workspaceWatcher.on('error', () => stopWorkspaceWatch())
    watchReferences()
    return true
  } catch {
    // La sorveglianza non è disponibile (es. cartella di rete): resta il pulsante "Aggiorna".
    return false
  }
})
app.on('will-quit', stopWorkspaceWatch)
app.on('will-quit', () => { knowledge.close().catch(() => {}); gpuContext.close().catch(() => {}) })

// Ponte per il server MCP (vedi mcp-bridge.cjs): gli agenti esterni modificano i documenti aperti nell'editor, con le modifiche "da rivedere".
// L'utente lo spegne dalle impostazioni (Agenti (MCP)): preferenza openwriter.mcpEdit = "off".
const mcpBridge = createMcpBridge({
  directory: app.getPath('userData'),
  getWindow: () => mainWindow,
  getProjectPath: () => projectPath,
  isEnabled: () => loadPreferences()['openwriter.mcpEdit'] !== 'off',
  // Con l'app aperta la ricerca per conoscenza di un agente esterno passa da qui: stessa ricerca dell'assistente, quindi anche per significato (se acceso).
  localTools: { search_knowledge: (args, context) => searchKnowledgeTool(args, 'read_document', { project: context?.project }) },
})
ipcMain.on('mcp:response', (_event, id, payload) => mcpBridge.answer(id, payload))

// Trasporto HTTP del server MCP (vedi mcp-http.cjs): spento di default, lo attiva l'utente dalle impostazioni. Preferenze: openwriter.mcpHttp = "on",
// openwriter.mcpHttpReadOnly = "on" (senza strumenti di scrittura).
const mcpHttp = createMcpHttp({ directory: app.getPath('userData'), serverPath: path.join(__dirname, 'mcp-server.cjs'), packaged: app.isPackaged, execPath: process.execPath })
const startMcpHttp = (options = {}) => mcpHttp.start({ readOnly: loadPreferences()['openwriter.mcpHttpReadOnly'] === 'on', ...options })
ipcMain.handle('mcp:http-status', () => mcpHttp.status())
ipcMain.handle('mcp:http-set', async (_event, { enabled, renewToken } = {}) => {
  const preferencesNow = loadPreferences()
  if (enabled === false) { mcpHttp.stop(); preferencesNow['openwriter.mcpHttp'] = 'off'; flushPreferences(); return mcpHttp.status() }
  preferencesNow['openwriter.mcpHttp'] = 'on'
  flushPreferences()
  return startMcpHttp({ renewToken: renewToken === true })
})
app.on('will-quit', () => mcpHttp.stop())
if (loadPreferences()['openwriter.mcpHttp'] === 'on') app.whenReady().then(() => startMcpHttp()).catch((error) => console.error('Server MCP HTTP non avviato:', error.message))
app.on('will-quit', () => mcpBridge.stop())

// Il browser integrato mantiene i login dopo un riavvio. I cookie con scadenza li tiene già la partizione persistente; quelli "di sessione"
// (senza scadenza: molti siti li usano per il login) Chromium li butta alla chiusura, quindi si rendono persistenti, con una scadenza di 30 giorni.
const SESSION_COOKIE_DAYS = 30
function keepBrowserLogins(browserSession) {
  const sameSite = { unspecified: 'unspecified', no_restriction: 'no_restriction', lax: 'lax', strict: 'strict' }
  browserSession.cookies.on('changed', (_event, cookie, _cause, removed) => {
    if (removed || !cookie.session) return
    const host = String(cookie.domain || '').replace(/^\./, '')
    if (!host) return
    browserSession.cookies.set({
      url: `http${cookie.secure ? 's' : ''}://${host}${cookie.path || '/'}`,
      name: cookie.name,
      value: cookie.value,
      ...(cookie.hostOnly ? {} : { domain: cookie.domain }),
      path: cookie.path || '/',
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: sameSite[cookie.sameSite] || 'unspecified',
      expirationDate: Math.floor(Date.now() / 1000) + SESSION_COOKIE_DAYS * 86400,
    }).catch(() => { /* cookie non valido (es. prefisso __Host-): resta di sessione */ })
  })
  // Prima di uscire si scrivono su disco, senza aspettare il salvataggio periodico di Chromium.
  let flushed = false
  app.on('before-quit', (event) => {
    if (flushed) return
    event.preventDefault()
    flushed = true
    Promise.race([browserSession.cookies.flushStore(), new Promise((resolve) => { setTimeout(resolve, 3000) })]).catch(() => {}).finally(() => app.quit())
  })
}

ipcMain.handle('app:get-version', () => app.getVersion())
// Il controllo automatico all'avvio è silenzioso (rete assente, limite di GitHub…); quello manuale segnala l'errore.
ipcMain.handle('app:latest-release', async (_event, silent) => fetchLatestRelease().catch((error) => { if (silent) return null; throw error }))
// Solo pagine di GitHub: il link arriva dal renderer.
ipcMain.handle('app:open-release', (_event, url) => (/^https:\/\/github\.com\//.test(String(url)) ? shell.openExternal(String(url)) : false))
ipcMain.handle('i18n:set-locale', (_event, code) => {
  const before = getLocale()
  const after = setLocale(code)
  if (after !== before) {
    try { fsSync.writeFileSync(languageFilePath(), JSON.stringify({ locale: after })) } catch (error) { console.error(error) }
    buildMenu()
  }
  return after
})

// Documenti Markdown aperti dal sistema (doppio clic, "Apri con", riga di comando): arrivano al renderer appena è pronto.
// L'app resta una sola: un secondo avvio passa i file a quella già aperta (solo nella versione installata, per non intralciare le prove in sviluppo).
const MARKDOWN_PATTERN = /\.(md|markdown|mdown)$/i
const pendingExternalDocuments = []
let externalDocumentsReady = false

// Cartelle passate all'app (la voce «Apri come progetto OpenWriter» del file manager, o la riga di comando): si aprono come progetto.
const folderArguments = (argv) => argv.slice(app.isPackaged ? 1 : 2).filter((argument) => {
  if (argument.startsWith('-') || MARKDOWN_PATTERN.test(argument)) return false
  try { return fsSync.statSync(argument).isDirectory() } catch { return false }
})
const pendingExternalProjects = []
function openExternalProject(directory) {
  const resolved = path.resolve(directory)
  if (externalDocumentsReady && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('project:external', resolved)
  else pendingExternalProjects.push(resolved)
}
ipcMain.handle('project:take-external', () => pendingExternalProjects.splice(0))

const markdownArguments = (argv) => argv.slice(app.isPackaged ? 1 : 2).filter((argument) => !argument.startsWith('-') && MARKDOWN_PATTERN.test(argument) && fsSync.existsSync(argument))

async function openExternalDocument(filePath) {
  try {
    const document = await readDocument(path.resolve(filePath))
    if (externalDocumentsReady && mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('document:external', document)
    else pendingExternalDocuments.push(document)
  } catch (error) {
    console.error('Documento non aperto:', error.message)
  }
}

ipcMain.handle('document:take-external', () => {
  externalDocumentsReady = true
  return pendingExternalDocuments.splice(0)
})

// Integrazione con il sistema (Impostazioni → Associazioni): file Markdown associati all'app e voce «Apri come progetto OpenWriter» nel file manager, per piattaforma
// (vedi system-integration.cjs). Solo nella versione installata.
const systemIntegration = createSystemIntegration({
  platform: process.platform,
  exePath: process.execPath,
  packaged: app.isPackaged,
  label: () => t('Open as OpenWriter project'),
  run: (file, args) => new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, timeout: 15000 }, (error, stdout) => resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout || '') }))
  }),
})
ipcMain.handle('integration:status', () => systemIntegration.status())
ipcMain.handle('integration:set-markdown', (_event, on) => systemIntegration.setMarkdown(on === true))
ipcMain.handle('integration:set-folder-menu', (_event, on) => systemIntegration.setFolderMenu(on === true))
// Windows non permette di imporre l'app predefinita: si apre la pagina delle App predefinite, dove l'utente sceglie.
ipcMain.handle('integration:open-default-apps', () => (process.platform === 'win32' ? shell.openExternal('ms-settings:defaultapps').then(() => true, () => false) : false))

if (app.isPackaged && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    for (const filePath of markdownArguments(argv)) openExternalDocument(filePath)
    for (const directory of folderArguments(argv)) openExternalProject(directory)
  })
}

// macOS consegna i file con questo evento (anche prima che l'app sia pronta).
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (MARKDOWN_PATTERN.test(filePath)) openExternalDocument(filePath)
  else { try { if (fsSync.statSync(filePath).isDirectory()) openExternalProject(filePath) } catch { /* non esiste */ } }
})

app.whenReady().then(async () => {
  protocol.handle('ow-file', (request) => {
    const file = path.normalize(decodeURIComponent(new URL(request.url).pathname.slice(1)))
    if (!IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase())) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
  const browserSession = session.fromPartition(BROWSER_PARTITION)
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  browserSession.on('will-download', (event) => event.preventDefault())
  keepBrowserLogins(browserSession)
  loadLanguage()
  await loadProject()
  createWindow()
  buildMenu()
  mcpBridge.start()
  for (const filePath of markdownArguments(process.argv)) openExternalDocument(filePath)
  for (const directory of folderArguments(process.argv)) openExternalProject(directory)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
