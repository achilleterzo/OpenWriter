const { app, BrowserWindow, dialog, ipcMain, net, protocol, safeStorage, screen, session, shell, webContents } = require('electron')
const { pathToFileURL } = require('node:url')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const mammoth = require('mammoth')
const pdfParse = require('pdf-parse')
const { createApplicationMenu } = require('./menu.cjs')
const { createAiProviders } = require('./ai-providers.cjs')
const { createProjectFile } = require('./project-file.cjs')
const { createProjectsStore } = require('./projects.cjs')
const { createChatStore } = require('./chat-store.cjs')
const { createMemoryStore } = require('./memory-store.cjs')
const { fetchLatestRelease } = require('./updates.cjs')
const { createProjectTools } = require('./project-tools.cjs')
const { createNotesStore } = require('./notes-store.cjs')
const images = require('./images.cjs')
const { t, setLocale, getLocale } = require('./i18n.cjs')

const isDevelopment = !app.isPackaged
let mainWindow
// Le immagini dei documenti (percorsi relativi al documento) si mostrano tramite ow-file://: solo file immagine, in sola lettura.
protocol.registerSchemesAsPrivileged([{ scheme: 'ow-file', privileges: { standard: true, secure: true } }])
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']

let projectPath = null
const projectsStore = createProjectsStore({ filePath: () => path.join(app.getPath('userData'), 'projects.json') })
const projectFile = createProjectFile({ getProjectPath: () => projectPath })
const chatStore = createChatStore({ getProjectPath: () => projectPath })
const memoryStore = createMemoryStore({ getProjectPath: () => projectPath })
const projectRelative = (absolute) => path.relative(projectPath, absolute).split(path.sep).join('/')
const notesStore = createNotesStore({ getProjectPath: () => projectPath })
const projectTools = createProjectTools({ getProjectPath: () => projectPath, readDocument: (filePath) => readDocument(filePath) })
const aiRequests = new Map()
const BROWSER_PARTITION = 'persist:openwriter-browser'
const aiProviders = createAiProviders({
  app,
  safeStorage,
  getWorkingDirectory: () => projectPath || undefined,
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
const hiddenDirectories = new Set(['node_modules', 'dist', 'out'])

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
    const document = await pdfParse(buffer)
    return { filePath, content: textToHtml(document.text), contentType: 'html', format: 'pdf' }
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

function loadSession() {
  return readSessions()[sessionKey()] || null
}

function saveSession(session) {
  const sessions = readSessions()
  sessions[sessionKey()] = session
  fsSync.mkdirSync(app.getPath('userData'), { recursive: true })
  fsSync.writeFileSync(sessionsFilePath(), JSON.stringify(sessions))
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
  if (projectPath && !projectsStore.list().some((item) => item.path.toLowerCase() === path.resolve(projectPath).toLowerCase())) projectsStore.touch(projectPath)
}

// Prepara la cartella .ow all'apertura del progetto; un errore (es. cartella in sola lettura) non deve impedire di lavorare.
function initializeProject() {
  try { projectFile.initialize() } catch (error) { console.error('Inizializzazione .ow non riuscita:', error.message) }
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
      if (!stats.isFile() || !documentExtensions.includes(path.extname(source).toLowerCase())) { skipped.push(source); continue }
      const destination = await uniqueDestination(directory, path.basename(source))
      await fs.copyFile(source, destination, fsSync.constants.COPYFILE_EXCL)
      copied.push(destination)
    } catch {
      skipped.push(source)
    }
  }
  return { copied, skipped }
}

async function renamePath({ path: target, newName }) {
  const source = resolveInProject(target)
  if (source === projectPath) throw new Error(t('The project folder cannot be renamed from here'))
  const name = String(newName || '').trim()
  if (!name || name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name)) throw new Error(t('Invalid name'))
  const isDirectory = (await fs.stat(source)).isDirectory()
  // Se l'estensione viene omessa o non è supportata, si conserva quella originale.
  const finalName = isDirectory || documentExtensions.includes(path.extname(name).toLowerCase()) ? name : `${name}${path.extname(source)}`
  const destination = resolveInProject(path.join(path.dirname(source), finalName))
  if (destination === source) return source
  const caseOnlyChange = destination.toLowerCase() === source.toLowerCase()
  if (!caseOnlyChange && fsSync.existsSync(destination)) throw new Error(t('An item with this name already exists'))
  await fs.rename(source, destination)
  try { projectFile.moveHistory(source, destination) } catch (error) { console.error('Cronologia non spostata:', error) }
  try { notesStore.move(source, destination) } catch (error) { console.error('Note non spostate:', error) }
  try { memoryStore.renameFile(projectRelative(source), projectRelative(destination)) } catch (error) { console.error('Memoria non aggiornata:', error) }
  return destination
}

async function deletePath(target) {
  const source = resolveInProject(target)
  if (source === projectPath) throw new Error(t('The project folder cannot be deleted from here'))
  const isDirectory = (await fs.stat(source)).isDirectory()
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: [t('Move to the trash'), t('Cancel')],
    defaultId: 1,
    cancelId: 1,
    message: t('Delete "{basename}"?', { basename: path.basename(source) }),
    detail: isDirectory ? t('The folder and all its contents will be moved to the trash.') : t('The file will be moved to the trash.'),
  })
  if (response !== 0) return false
  await shell.trashItem(source)
  return true
}

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

async function listDirectory(directory) {
  const entries = await fs.readdir(resolveInProject(directory), { withFileTypes: true })
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .filter((entry) => entry.isDirectory()
      ? !hiddenDirectories.has(entry.name)
      : documentExtensions.includes(path.extname(entry.name).toLowerCase()))
    .map((entry) => ({ name: entry.name, path: path.join(directory, entry.name), isDirectory: entry.isDirectory() }))
    .sort((left, right) => Number(right.isDirectory) - Number(left.isDirectory) || left.name.localeCompare(right.name, 'it', { sensitivity: 'base' }))
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
ipcMain.handle('document:open-path', async (_event, filePath) => {
  const target = resolveInProject(filePath)
  const stats = await fs.stat(target).catch(() => null)
  if (!stats) throw new Error(t('Could not open the file'))
  if (stats.isDirectory()) throw new Error(t('Not a file'))
  return readDocument(target)
})
ipcMain.handle('document:reopen', (_event, filePath) => readSessionDocument(filePath))
ipcMain.handle('session:load', () => loadSession())
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
  if (projectPath && path.resolve(projectPath).toLowerCase() === target.toLowerCase()) applySpellcheck()
  return saved
})
// Copia il contesto per l'assistente (context.md e gli altri .md di istruzioni in .ow) da un progetto a un altro.
ipcMain.handle('projects:copy-context', (_event, { from, to, mode } = {}) => {
  const source = projectFileFor(from)
  const destination = projectFileFor(to)
  if (source.target.toLowerCase() === destination.target.toLowerCase()) throw new Error(t('Choose a different project'))
  destination.file.initialize()
  const sourceSettings = source.file.getSettings()
  const incoming = String(sourceSettings.ai?.context || '')
  const extras = sourceSettings.ai?.extraContext || []
  if (!incoming.trim() && !extras.length) throw new Error(t('The source project has no context'))
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
  return { characters: destination.file.getSettings().ai.context.length, extraFiles: copied }
})
ipcMain.handle('project:get-settings', () => projectFile.getSettings())
ipcMain.handle('project:save-settings', (_event, settings) => {
  const saved = projectFile.saveSettings(settings)
  applySpellcheck()
  return saved
})
// Chat in streaming: gli eventi (testo, ragionamento, stato) arrivano al renderer man mano, e la richiesta si può interrompere.
ipcMain.handle('ai:chat-stream', async (event, { requestId, messages, tools }) => {
  const controller = new AbortController()
  aiRequests.set(requestId, controller)
  try {
    return await aiProviders.chatStream(messages, {
      signal: controller.signal,
      tools: Array.isArray(tools) ? tools : [],
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
ipcMain.handle('tools:list-directory', (_event, relativePath) => projectTools.listDirectory(relativePath))
ipcMain.handle('tools:read-file', (_event, { path: relativePath, offset, limit } = {}) => projectTools.readFile(relativePath, { offset, limit }))
ipcMain.handle('ai:capabilities', (_event, model) => aiProviders.getCapabilities(model))
ipcMain.handle('images:fetch', (_event, url) => images.fetchImage(String(url)))
ipcMain.handle('images:read-file', async (_event, relativePath) => images.prepareBuffer(await projectTools.readImage(relativePath)))
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
ipcMain.handle('chat:save-attachment', (_event, attachment) => chatStore.saveAttachment(attachment || {}))
ipcMain.handle('chat:get-attachment', (_event, id) => chatStore.getAttachment(id))
ipcMain.handle('notes:list', (_event, filePath) => notesStore.list(filePath))
ipcMain.handle('notes:list-all', () => (projectPath ? notesStore.listAll() : []))
ipcMain.handle('notes:add', (_event, { filePath, note }) => notesStore.add(filePath, note))
ipcMain.handle('notes:update', (_event, { filePath, id, changes }) => notesStore.update(filePath, id, changes))
ipcMain.handle('notes:delete', (_event, { filePath, id }) => notesStore.remove(filePath, id))
ipcMain.handle('chat:list', () => (projectPath ? chatStore.list() : []))
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
ipcMain.handle('workspace:remove-project', (_event, directory) => { projectsStore.remove(String(directory || '')); return projectsStore.list() })
// Per l'assistente: sposta nel cestino (con la conferma dell'utente) o sposta/rinomina dentro il progetto.
ipcMain.handle('memory:list', () => (projectPath ? memoryStore.list() : []))
ipcMain.handle('memory:add', (_event, entry) => memoryStore.add(entry))
ipcMain.handle('memory:update', (_event, { id, changes } = {}) => memoryStore.update(id, changes))
ipcMain.handle('memory:delete', (_event, id) => memoryStore.remove(id))
ipcMain.handle('tools:delete-path', async (_event, relativePath) => {
  const { target, relative } = projectTools.resolvePath(relativePath)
  if (!relative) throw new Error(t('The project folder cannot be deleted from here'))
  if (!fsSync.existsSync(target)) throw new Error(t('This path is not accessible'))
  return { deleted: await deletePath(target), absolute: target, path: relative }
})
ipcMain.handle('tools:move-path', async (_event, { from, to } = {}) => {
  const source = projectTools.resolvePath(from)
  const destination = projectTools.resolvePath(to)
  if (!source.relative || !destination.relative) throw new Error(t('Invalid name'))
  if (!fsSync.existsSync(source.target)) throw new Error(t('This path is not accessible'))
  if (fsSync.existsSync(destination.target)) throw new Error(t('An item with this name already exists'))
  await fs.mkdir(path.dirname(destination.target), { recursive: true })
  await fs.rename(source.target, destination.target)
  try { projectFile.moveHistory(source.target, destination.target) } catch (error) { console.error('Cronologia non spostata:', error) }
  try { notesStore.move(source.target, destination.target) } catch (error) { console.error('Note non spostate:', error) }
  try { memoryStore.renameFile(source.relative, destination.relative) } catch (error) { console.error('Memoria non aggiornata:', error) }
  return { from: source.target, to: destination.target, path: destination.relative }
})
ipcMain.handle('tools:create-directory', (_event, relativePath) => projectTools.createDirectory(relativePath))
ipcMain.handle('tools:create-file', (_event, { path: relativePath, content, allowSameName } = {}) => projectTools.createFile(relativePath, content, { allowSameName: allowSameName === true }))
// Dal file manager: nuova cartella o nuovo documento Markdown vuoto dentro `parent`; restituisce il percorso assoluto creato.
ipcMain.handle('workspace:create-entry', async (_event, { parent, name, type } = {}) => {
  const base = resolveInProject(parent)
  const clean = String(name || '').trim()
  if (!clean || clean === '.' || clean === '..' || /[\\/:*?"<>|]/.test(clean)) throw new Error(t('Invalid name'))
  const relative = path.relative(projectPath, path.join(base, clean)).split(path.sep).join('/')
  const directory = type === 'directory'
  const final = directory || path.extname(clean) ? relative : `${relative}.md`
  if (fsSync.existsSync(path.join(projectPath, final))) throw new Error(t('An item with this name already exists'))
  return (directory ? await projectTools.createDirectory(final) : await projectTools.createFile(final, '')).absolute
})
ipcMain.handle('app:open-link', (_event, url) => (/^https?:\/\//i.test(String(url)) ? shell.openExternal(String(url)) : false))
ipcMain.handle('images:pick', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { defaultPath: projectPath || undefined, properties: ['openFile'], filters: [{ name: t('Image'), extensions: IMAGE_EXTENSIONS.map((extension) => extension.slice(1)) }] })
  return result.canceled ? null : result.filePaths[0]
})
// Porta un'immagine (file esistente o dati incollati) nella cartella images/ del progetto e restituisce il percorso assoluto.
ipcMain.handle('images:import', async (_event, { sourcePath, data, mime, name } = {}) => {
  if (!projectPath) throw new Error(t('No project open'))
  const fromMime = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp', 'image/bmp': '.bmp' }[mime]
  const extension = (sourcePath ? path.extname(sourcePath) : fromMime || '').toLowerCase()
  if (!IMAGE_EXTENSIONS.includes(extension)) throw new Error(t('Unsupported format: png, jpg, gif, webp and bmp are allowed'))
  const directory = path.join(projectPath, 'images')
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
ipcMain.handle('workspace:reveal-path', (_event, target) => { shell.showItemInFolder(resolveInProject(target)) })
ipcMain.handle('workspace:list-directory', (_event, directory) => listDirectory(directory))
ipcMain.handle('document:save-markdown', async (_event, { filePath, markdown, saveAs }) => {
  const targetPath = await chooseSavePath({
    filePath,
    saveAs,
    defaultPath: `${t('New document')}.md`,
    filters: [markdownFilter],
  })
  if (!targetPath) return null
  const markdownPath = /\.(md|markdown|mdown)$/i.test(targetPath) ? targetPath : `${targetPath}.md`
  await fs.writeFile(markdownPath, markdown, 'utf8')
  // La cronologia non deve mai far fallire il salvataggio.
  try {
    if (projectPath && projectFile.autoVersionsEnabled()) projectFile.addVersion(markdownPath, markdown, { auto: true })
  } catch (error) {
    console.error('Versione non salvata:', error)
  }
  return markdownPath
})
ipcMain.handle('document:export-docx', async (_event, { html }) => {
  const targetPath = await chooseSavePath({
    defaultPath: `${t('New document')}.docx`,
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
ipcMain.handle('document:print', (_event, { html }) => printDocument(String(html || '')))
ipcMain.handle('document:export-pdf', async (_event, { html }) => {
  const targetPath = await chooseSavePath({
    defaultPath: `${t('New document')}.pdf`,
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
ipcMain.handle('ai:has-api-key', () => aiProviders.hasApiKey())
ipcMain.handle('ai:save-api-key', (_event, value) => aiProviders.saveApiKey(value))
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

function buildMenu() {
  createApplicationMenu((command) => {
    if (['settings', 'open-project', 'about', 'check-updates'].includes(command)) mainWindow?.webContents.send('app:command', command)
    else mainWindow?.webContents.send('document:command', command)
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

app.whenReady().then(async () => {
  protocol.handle('ow-file', (request) => {
    const file = path.normalize(decodeURIComponent(new URL(request.url).pathname.slice(1)))
    if (!IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase())) return new Response('Forbidden', { status: 403 })
    return net.fetch(pathToFileURL(file).toString())
  })
  const browserSession = session.fromPartition(BROWSER_PARTITION)
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  browserSession.on('will-download', (event) => event.preventDefault())
  loadLanguage()
  await loadProject()
  createWindow()
  buildMenu()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
