const { app, BrowserWindow, dialog, ipcMain, nativeImage, net, protocol, safeStorage, screen, session, shell, webContents } = require('electron')
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
const projectIcon = require('./project-icon.cjs')
const { createLinksStore, checkedPaths, writeLinksTo } = require('./project-links.cjs')
const { createSkillsStore, skillFromMarkdown, MAX_SKILL_CHARS } = require('./skills-store.cjs')
// Un carattere UTF-8 occupa al massimo 4 byte: oltre, il file supera di sicuro il limite delle skill.
const MAX_SKILL_FILE_BYTES = MAX_SKILL_CHARS * 4
const images = require('./images.cjs')
const { t, setLocale, getLocale } = require('./i18n.cjs')

const isDevelopment = !app.isPackaged
let mainWindow
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
const notesStore = createNotesStore({ getProjectPath: storePath, getMainPath: mainDirectory })
// Documenti esterni collegati al progetto aperto (senza copiarli).
const linksStore = createLinksStore({ getProjectPath: () => projectPath })
const skillsStore = createSkillsStore({ getGlobalDirectory: () => path.join(app.getPath('userData'), 'skills') })
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
  fsSync.writeFileSync(sessionsFilePath(), JSON.stringify(walk(sessions), null, 2))
}

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
  // Il progetto main esiste sempre, anche con un progetto aperto: ci vivono i documenti sparsi.
  if (projectPath) {
    try { createProjectFile({ getProjectPath: mainDirectory }).initialize() } catch (error) { console.error('Inizializzazione .ow del progetto main non riuscita:', error.message) }
  }
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
  moveArtifacts(source, destination)
  return destination
}

// Tutto ciò che riguarda un file o una cartella (cronologia, note, memoria) lo segue quando viene rinominato o spostato,
// anche in un altro progetto (sotto-progetto o progetto padre).
function moveArtifacts(source, destination) {
  try { projectFile.moveHistory(source, destination) } catch (error) { console.error('Cronologia non spostata:', error) }
  try { notesStore.move(source, destination) } catch (error) { console.error('Note non spostate:', error) }
  try { memoryStore.relocate(source, destination) } catch (error) { console.error('Memoria non aggiornata:', error) }
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
  await fs.rename(source, destination)
  moveArtifacts(source, destination)
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
    detail: isDirectory
      ? t('The folder and all its contents will be moved to the trash.') + (fsSync.existsSync(path.join(source, projectFile.directoryName)) ? ` ${t('It is a sub-project: its history, notes and settings go with it.')}` : '')
      : t('The file will be moved to the trash.'),
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

const convertibleExtensions = ['.docx', '.pdf']

async function listDirectory(directory) {
  const resolved = resolveInProject(directory)
  const entries = await fs.readdir(resolved, { withFileTypes: true })
  const visible = entries
    .filter((entry) => !entry.name.startsWith('.'))
    .filter((entry) => entry.isDirectory()
      ? !hiddenDirectories.has(entry.name)
      : documentExtensions.includes(path.extname(entry.name).toLowerCase()))
  // Un DOCX/PDF che ha già il suo Markdown (stesso nome) non sta più in lista: compare sotto il Markdown, come originale in sola lettura.
  const stem = (entry) => path.basename(entry.name, path.extname(entry.name)).toLowerCase()
  const isMarkdown = (entry) => !entry.isDirectory() && path.extname(entry.name).toLowerCase() === '.md'
  const markdownNames = new Set(visible.filter(isMarkdown).map(stem))
  const originalOf = (entry) => !entry.isDirectory() && convertibleExtensions.includes(path.extname(entry.name).toLowerCase()) && markdownNames.has(stem(entry))
  const originals = new Map()
  for (const entry of visible.filter(originalOf)) originals.set(stem(entry), [...(originals.get(stem(entry)) || []), { name: entry.name, path: path.join(directory, entry.name) }])
  return visible
    .filter((entry) => !originalOf(entry))
    // Una cartella con una `.ow` propria è un sotto-progetto: l'explorer la distingue dalle altre.
    .map((entry) => ({
      name: entry.name,
      path: path.join(directory, entry.name),
      isDirectory: entry.isDirectory(),
      isProject: entry.isDirectory() && fsSync.existsSync(path.join(resolved, entry.name, projectFile.directoryName)),
      ...(isMarkdown(entry) && originals.has(stem(entry)) ? { originals: originals.get(stem(entry)) } : {}),
    }))
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
ipcMain.handle('projects:copy-context', (_event, { from, to, mode } = {}) => {
  const source = projectFileFor(from)
  const destination = projectFileFor(to)
  if (source.target.toLowerCase() === destination.target.toLowerCase()) throw new Error(t('Choose a different project'))
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
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Markdown', extensions: ['md', 'markdown', 'txt'] }] })
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
// Contesto dell'assistente per il documento attivo: le istruzioni di tutti i progetti coinvolti, dal più esterno al più vicino.
ipcMain.handle('project:context-chain', (_event, filePath) => projectFile.getContextChain(filePath))
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
ipcMain.handle('tools:list-directory', async (_event, relativePath, options = {}) => {
  const result = await projectTools.listDirectory(relativePath, { sort: options?.sort === 'date' ? 'date' : 'name' })
  if (result.path === '.') result.linked = linksStore.list()
  return result
})
ipcMain.handle('tools:read-file', (_event, { path: relativePath, offset, limit } = {}) => projectTools.readFile(relativePath, { offset, limit, absolute: linksStore.has(relativePath) }))
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
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile', 'multiSelections'], filters: [{ name: t('Attachments'), extensions }] })
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
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: [t('Choose the folder…'), t('Cancel')],
    defaultId: 0,
    cancelId: 1,
    message: t('The assistant wants to create the project "{name}"', { name: folderName }),
    detail: [
      linked.length ? `${t('These documents will be linked to it, not copied: any change goes to the original files, where they are now.')}\n${listed}` : t('No documents will be linked.'),
      t('The app will open the new project and the conversation will continue there.'),
    ].join('\n\n'),
  })
  if (response !== 0) return null
  const picked = await dialog.showOpenDialog(mainWindow, { title: t('Choose where to create the project'), defaultPath: app.getPath('documents'), properties: ['openDirectory', 'createDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return null
  const target = path.join(picked.filePaths[0], folderName)
  if (fsSync.existsSync(target)) throw new Error(t('An item with this name already exists'))
  await fs.mkdir(target)
  return { path: target, links: writeLinksTo(target, linked) }
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
  moveArtifacts(source.target, destination.target)
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

const isInsideOf = (root, target) => {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

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
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: [t('Choose the destination…'), t('Cancel')],
    defaultId: 0,
    cancelId: 1,
    message: t('Make the sub-project "{name}" a standalone project?', { name: path.basename(source) }),
    detail: t('The folder is moved out of this project to the place you choose, with its history, notes and memory. It will no longer inherit the instructions of this project.'),
  })
  if (response !== 0) return null
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
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: [t('Move'), t('Cancel')],
    defaultId: 0,
    cancelId: 1,
    message: t('Move the project "{name}" into this project?', { name: path.basename(source) }),
    detail: t('The folder is moved (not copied) to {destination} and becomes a sub-project, with its history, notes and memory. It will inherit the instructions of this project, unless you change it in its settings.', { destination }),
  })
  if (response !== 0) return null
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
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: [t('Choose the destination…'), t('Cancel')],
    defaultId: 0,
    cancelId: 1,
    message: t('Move the project "{name}"?', { name: path.basename(source) }),
    detail: t('The whole folder is moved to the place you choose, with its history, notes and memory.'),
  })
  if (response !== 0) return null
  const picked = await dialog.showOpenDialog(mainWindow, { title: t('Choose where to move the project'), defaultPath: path.dirname(source), properties: ['openDirectory', 'createDirectory'] })
  if (picked.canceled || !picked.filePaths[0]) return null
  const parent = path.resolve(picked.filePaths[0])
  if (isInsideOf(source, parent)) throw new Error(t('Choose a folder outside the project'))
  const target = path.join(parent, path.basename(source))
  if (path.resolve(target).toLowerCase() === source.toLowerCase()) return null
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
    const files = (Array.isArray(targets) ? targets : [targets]).slice(0, 50).map((item) => (linksStore.has(String(item)) ? path.resolve(String(item)) : resolveInProject(String(item)))).filter((item) => fsSync.existsSync(item))
    if (!files.length) return
    const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png')).resize({ width: 32, height: 32 })
    event.sender.startDrag(files.length > 1 ? { files, icon } : { file: files[0], icon })
  } catch (error) {
    console.error('Trascinamento non avviato:', error.message)
  }
})
ipcMain.handle('workspace:move-path', (_event, request) => moveIntoDirectory(request || {}))
ipcMain.handle('workspace:reveal-path', (_event, target) => { shell.showItemInFolder(resolveInProject(target)) })
ipcMain.handle('workspace:list-directory', (_event, directory) => listDirectory(directory))
ipcMain.handle('document:save-markdown', async (_event, { filePath, markdown, saveAs, defaultName }) => {
  const targetPath = await chooseSavePath({
    filePath,
    saveAs,
    // `defaultName` (es. il titolo di un articolo salvato dal browser): propone quel nome nella cartella del progetto.
    defaultPath: defaultName ? path.join(projectPath || '', `${path.basename(String(defaultName))}.md`) : `${t('New document')}.md`,
    filters: [markdownFilter],
  })
  if (!targetPath) return null
  const markdownPath = /\.(md|markdown|mdown)$/i.test(targetPath) ? targetPath : `${targetPath}.md`
  await fs.writeFile(markdownPath, markdown, 'utf8')
  // La cronologia non deve mai far fallire il salvataggio.
  try {
    if (projectFile.autoVersionsEnabled(markdownPath)) projectFile.addVersion(markdownPath, markdown, { auto: true })
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

// Documenti Markdown aperti dal sistema (doppio clic, "Apri con", riga di comando): arrivano al renderer appena è pronto.
// L'app resta una sola: un secondo avvio passa i file a quella già aperta (solo nella versione installata, per non intralciare le prove in sviluppo).
const MARKDOWN_PATTERN = /\.(md|markdown|mdown)$/i
const pendingExternalDocuments = []
let externalDocumentsReady = false

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

if (app.isPackaged && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    for (const filePath of markdownArguments(argv)) openExternalDocument(filePath)
  })
}

// macOS consegna i file con questo evento (anche prima che l'app sia pronta).
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (MARKDOWN_PATTERN.test(filePath)) openExternalDocument(filePath)
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
  for (const filePath of markdownArguments(process.argv)) openExternalDocument(filePath)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
