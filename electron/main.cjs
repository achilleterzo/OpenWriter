const { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, session, shell, webContents } = require('electron')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const mammoth = require('mammoth')
const htmlToDocx = require('html-to-docx')
const pdfParse = require('pdf-parse')
const { createApplicationMenu } = require('./menu.cjs')
const { createAiProviders } = require('./ai-providers.cjs')
const { createProjectFile } = require('./project-file.cjs')
const { createChatStore } = require('./chat-store.cjs')
const { createProjectTools } = require('./project-tools.cjs')
const { createNotesStore } = require('./notes-store.cjs')
const images = require('./images.cjs')

const isDevelopment = !app.isPackaged
let mainWindow
let projectPath = null
const projectFile = createProjectFile({ getProjectPath: () => projectPath })
const chatStore = createChatStore({ getProjectPath: () => projectPath })
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

const supportedDocumentsFilter = {
  name: 'Tutti i file supportati',
  extensions: ['md', 'markdown', 'mdown', 'docx', 'pdf'],
}

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
    filters: [supportedDocumentsFilter, markdownFilter, { name: 'Word', extensions: ['docx'] }, { name: 'PDF', extensions: ['pdf'] }],
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
  applySpellcheck()
  return projectPath
}

// Le operazioni del file explorer sono limitate alla cartella del progetto corrente.
function resolveInProject(target) {
  if (!projectPath) throw new Error('Nessun progetto aperto')
  const resolved = path.resolve(target)
  const relative = path.relative(projectPath, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Percorso fuori dal progetto')
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
  if (!(await fs.stat(directory)).isDirectory()) throw new Error('La destinazione non è una cartella')
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
  if (source === projectPath) throw new Error('Non si può rinominare la cartella del progetto da qui')
  const name = String(newName || '').trim()
  if (!name || name === '.' || name === '..' || /[\\/:*?"<>|]/.test(name)) throw new Error('Nome non valido')
  const isDirectory = (await fs.stat(source)).isDirectory()
  // Se l'estensione viene omessa o non è supportata, si conserva quella originale.
  const finalName = isDirectory || documentExtensions.includes(path.extname(name).toLowerCase()) ? name : `${name}${path.extname(source)}`
  const destination = resolveInProject(path.join(path.dirname(source), finalName))
  if (destination === source) return source
  const caseOnlyChange = destination.toLowerCase() === source.toLowerCase()
  if (!caseOnlyChange && fsSync.existsSync(destination)) throw new Error('Esiste già un elemento con questo nome')
  await fs.rename(source, destination)
  try { projectFile.moveHistory(source, destination) } catch (error) { console.error('Cronologia non spostata:', error) }
  try { notesStore.move(source, destination) } catch (error) { console.error('Note non spostate:', error) }
  return destination
}

async function deletePath(target) {
  const source = resolveInProject(target)
  if (source === projectPath) throw new Error('Non si può eliminare la cartella del progetto da qui')
  const isDirectory = (await fs.stat(source)).isDirectory()
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Sposta nel cestino', 'Annulla'],
    defaultId: 1,
    cancelId: 1,
    message: `Eliminare "${path.basename(source)}"?`,
    detail: isDirectory ? 'La cartella e tutto il suo contenuto verranno spostati nel cestino.' : 'Il file verrà spostato nel cestino.',
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

async function exportPdf(html, filePath) {
  const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } })
  const printableHtml = `<!doctype html><html><head><meta charset="UTF-8"><style>
    @page { size: A4; margin: 2cm; }
    body { font-family: Arial, sans-serif; color: #111827; line-height: 1.6; }
    h1, h2, h3, h4, h5, h6, p, ul, ol, blockquote, pre { margin: 0 0 12px; }
    blockquote { border-left: 3px solid #64748b; padding-left: 12px; color: #475569; }
    pre { padding: 12px; background: #f1f5f9; white-space: pre-wrap; }
    code { font-family: monospace; }
  </style></head><body>${html}</body></html>`

  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(printableHtml)}`)
    const pdf = await printWindow.webContents.printToPDF({ printBackground: true })
    await fs.writeFile(filePath, pdf)
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
ipcMain.handle('document:open-path', (_event, filePath) => readDocument(resolveInProject(filePath)))
ipcMain.handle('document:reopen', (_event, filePath) => readSessionDocument(filePath))
ipcMain.handle('session:load', () => loadSession())
ipcMain.handle('session:save', (_event, session) => saveSession(session))
ipcMain.on('session:save-sync', (event, session) => {
  try { saveSession(session) } catch (error) { console.error(error) }
  event.returnValue = true
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
  if (!contents || contents.getType() !== 'webview' || contents.hostWebContents !== mainWindow.webContents) throw new Error('Scheda browser non valida')
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
    defaultPath: 'Nuovo documento.md',
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
    defaultPath: 'Nuovo documento.docx',
    filters: [{ name: 'Word', extensions: ['docx'] }],
  })
  if (!targetPath) return null
  const docxPath = /\.docx$/i.test(targetPath) ? targetPath : `${targetPath}.docx`
  const document = await htmlToDocx(`<html><body>${html}</body></html>`, null, { title: 'Nuovo documento' })
  await fs.writeFile(docxPath, document)
  return docxPath
})
ipcMain.handle('document:export-pdf', async (_event, { html }) => {
  const targetPath = await chooseSavePath({
    defaultPath: 'Nuovo documento.pdf',
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

app.whenReady().then(async () => {
  const browserSession = session.fromPartition(BROWSER_PARTITION)
  browserSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  browserSession.on('will-download', (event) => event.preventDefault())
  await loadProject()
  createWindow()
  createApplicationMenu((command) => {
    if (command === 'settings' || command === 'open-project') mainWindow?.webContents.send('app:command', command)
    else mainWindow?.webContents.send('document:command', command)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
