const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')

const EXCLUDED_NAMES = new Set(['.ow', '.git', 'node_modules'])
const BINARY_DOCUMENT_EXTENSIONS = new Set(['.docx', '.pdf'])
const DEFAULT_READ_CHARS = 20000
const MAX_READ_CHARS = 40000
const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_LIST_ENTRIES = 300
const TEXT_DOCUMENT_EXTENSIONS = new Set(['.md', '.markdown', '.txt'])
const MAX_CREATED_CHARS = 500000

// Rimuove i tag di un HTML già convertito (DOCX/PDF) mantenendo titoli e a capo leggibili.
function htmlToText(html) {
  return String(html)
    .replace(/<h([1-7])[^>]*>/gi, (_, level) => `\n${'#'.repeat(Number(level))} `)
    .replace(/<\/(p|h[1-7]|li|tr|div)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * Strumenti di sola lettura sul progetto, pensati per l'assistente AI.
 * La cartella `.ow` (impostazioni, conversazioni, versioni, note) non è mai accessibile.
 */
function createProjectTools({ getProjectPath, readDocument }) {
  function resolveInside(relativePath = '') {
    const project = getProjectPath()
    if (!project) throw new Error(t('No project open'))
    const target = path.resolve(project, String(relativePath || '.'))
    const relative = path.relative(project, target)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(t('Path is outside the project'))
    if (relative.split(path.sep).some((part) => EXCLUDED_NAMES.has(part))) throw new Error(t('This path is not accessible'))
    return { target, relative: relative.split(path.sep).join('/') }
  }

  async function listDirectory(relativePath) {
    const { target, relative } = resolveInside(relativePath)
    const entries = await fs.promises.readdir(target, { withFileTypes: true }).catch(() => { throw new Error(t('Folder not found: {path}', { path: relative || '.' })) })
    const visible = entries.filter((entry) => !EXCLUDED_NAMES.has(entry.name))
    const items = await Promise.all(visible.slice(0, MAX_LIST_ENTRIES).map(async (entry) => {
      if (entry.isDirectory()) return { name: entry.name, type: 'directory' }
      let size = null
      try { size = (await fs.promises.stat(path.join(target, entry.name))).size } catch {}
      return { name: entry.name, type: 'file', size }
    }))
    items.sort((left, right) => Number(right.type === 'directory') - Number(left.type === 'directory') || left.name.localeCompare(right.name, 'it', { sensitivity: 'base' }))
    return { path: relative || '.', entries: items, truncated: visible.length > MAX_LIST_ENTRIES }
  }

  async function readFile(relativePath, { offset = 0, limit = DEFAULT_READ_CHARS } = {}) {
    const { target, relative } = resolveInside(relativePath)
    const stats = await fs.promises.stat(target).catch(() => null)
    if (!stats) throw new Error(t('File not found: {path}', { path: relative }))
    if (!stats.isFile()) throw new Error(t('Not a file: use list_directory for folders'))

    let text
    if (BINARY_DOCUMENT_EXTENSIONS.has(path.extname(target).toLowerCase())) {
      const document = await readDocument(target)
      text = htmlToText(document.content)
    } else {
      if (stats.size > MAX_TEXT_FILE_BYTES) throw new Error(t('File too large to be read as text'))
      const buffer = await fs.promises.readFile(target)
      if (buffer.includes(0)) throw new Error(t('The file is binary and cannot be read as text'))
      text = buffer.toString('utf8')
    }

    const start = Math.max(0, Number.parseInt(offset, 10) || 0)
    const size = Math.min(MAX_READ_CHARS, Math.max(1, Number.parseInt(limit, 10) || DEFAULT_READ_CHARS))
    const content = text.slice(start, start + size)
    const end = start + content.length
    return { path: relative, totalChars: text.length, offset: start, content, truncated: end < text.length, nextOffset: end < text.length ? end : null }
  }

  // Contenuto di un'immagine del progetto (la cartella .ow resta esclusa).
  async function readImage(relativePath) {
    const { target } = resolveInside(relativePath)
    if (!IMAGE_EXTENSIONS.has(path.extname(target).toLowerCase())) throw new Error(t('Unsupported format: png, jpg, gif, webp and bmp are allowed'))
    const stats = await fs.promises.stat(target)
    if (!stats.isFile()) throw new Error(t('Not a file'))
    if (stats.size > MAX_IMAGE_BYTES) throw new Error(t('Image too large (over 8 MB)'))
    return fs.promises.readFile(target)
  }

  // Crea una cartella (e le cartelle mancanti) nel progetto; se esiste già non fa nulla.
  async function createDirectory(relativePath) {
    const { target, relative } = resolveInside(relativePath)
    if (!relative) throw new Error(t('Invalid name'))
    const existing = await fs.promises.stat(target).catch(() => null)
    if (existing && !existing.isDirectory()) throw new Error(t('An item with this name already exists'))
    await fs.promises.mkdir(target, { recursive: true })
    return { path: relative, absolute: target, created: !existing }
  }

  // Documenti del progetto con lo stesso nome (senza distinguere maiuscole), in qualunque cartella: per non creare un doppione di un file già esistente altrove.
  function findSameName(fileName, limit = 5) {
    const project = getProjectPath()
    const wanted = fileName.toLowerCase()
    const found = []
    let visited = 0
    const walk = (directory, depth) => {
      if (found.length >= limit || depth > 8 || visited > 5000) return
      let entries = []
      try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        if (EXCLUDED_NAMES.has(entry.name)) continue
        visited += 1
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) walk(full, depth + 1)
        else if (entry.name.toLowerCase() === wanted) found.push(path.relative(project, full).split(path.sep).join('/'))
      }
    }
    walk(project, 0)
    return found
  }

  // Crea un nuovo documento di testo (.md, o .txt) con il contenuto dato; non sovrascrive mai un file esistente.
  async function createFile(relativePath, content = '', { allowSameName = false } = {}) {
    const requested = String(relativePath || '').trim()
    if (!requested) throw new Error(t('Invalid name'))
    const extension = path.extname(requested).toLowerCase()
    if (extension && !TEXT_DOCUMENT_EXTENSIONS.has(extension)) throw new Error(t('Only .md and .txt documents can be created'))
    const { target, relative } = resolveInside(extension ? requested : `${requested}.md`)
    const text = String(content ?? '')
    if (text.length > MAX_CREATED_CHARS) throw new Error(t('The content is too long'))
    if (fs.existsSync(target)) throw new Error(t('A file with this name already exists'))
    if (!allowSameName) {
      const others = findSameName(path.basename(target)).filter((item) => item.toLowerCase() !== relative.toLowerCase())
      if (others.length) throw new Error(`${t('A document with this name already exists in the project')}: ${others.join(', ')}`)
    }
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    await fs.promises.writeFile(target, text, { encoding: 'utf8', flag: 'wx' })
    return { path: relative, absolute: target }
  }

  // Percorso assoluto di un file/cartella del progetto (con gli stessi divieti degli altri strumenti).
  const resolvePath = (relativePath) => resolveInside(relativePath)

  return { listDirectory, readFile, readImage, createDirectory, createFile, resolvePath }
}

module.exports = { createProjectTools }
