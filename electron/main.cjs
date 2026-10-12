const { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
const mammoth = require('mammoth')
const htmlToDocx = require('html-to-docx')
const pdfParse = require('pdf-parse')
const { createApplicationMenu } = require('./menu.cjs')
const { createAiProviders } = require('./ai-providers.cjs')

const isDevelopment = !app.isPackaged
let mainWindow
const aiProviders = createAiProviders({
  app,
  safeStorage,
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

async function openDocument() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [supportedDocumentsFilter, markdownFilter, { name: 'Word', extensions: ['docx'] }, { name: 'PDF', extensions: ['pdf'] }],
  })

  if (result.canceled) return null

  const filePath = result.filePaths[0]
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDevelopment) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

ipcMain.handle('document:open', openDocument)
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

app.whenReady().then(() => {
  createWindow()
  createApplicationMenu((command) => {
    if (command === 'settings') mainWindow?.webContents.send('app:command', command)
    else mainWindow?.webContents.send('document:command', command)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
