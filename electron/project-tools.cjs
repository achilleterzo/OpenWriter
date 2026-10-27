const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')
const { searchFiles } = require('./project-search.cjs')

const EXCLUDED_NAMES = new Set(['.ow', '.git', 'node_modules'])
const BINARY_DOCUMENT_EXTENSIONS = new Set(['.docx', '.pdf'])
const DEFAULT_READ_CHARS = 20000
const MAX_READ_CHARS = 40000
const MAX_TEXT_FILE_BYTES = 64 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'])
const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_LIST_ENTRIES = 300
const MAX_SORTED_ENTRIES = 3000
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
    // `@sigla/…` indica una cartella di riferimento (sola lettura): si legge con gli strumenti di quella cartella, mai come percorso del progetto.
    if (String(relativePath || '').startsWith('@')) throw new Error(t('Reference folders are read-only and can only be listed and read'))
    const target = path.resolve(project, String(relativePath || '.'))
    const relative = path.relative(project, target)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(t('Path is outside the project'))
    if (relative.split(path.sep).some((part) => EXCLUDED_NAMES.has(part))) throw new Error(t('This path is not accessible'))
    return { target, relative: relative.split(path.sep).join('/') }
  }

  // `sort`: 'name' (cartelle prima, poi file per nome) o 'date' (dal più recente: cartelle e file insieme, per data di ultima modifica).
  // Ogni voce porta `modified` (millisecondi): per un file è la data dell'ultimo salvataggio su disco.
  async function listDirectory(relativePath, { sort = 'name' } = {}) {
    const { target, relative } = resolveInside(relativePath)
    const entries = await fs.promises.readdir(target, { withFileTypes: true }).catch(() => { throw new Error(t('Folder not found: {path}', { path: relative || '.' })) })
    const visible = entries.filter((entry) => !EXCLUDED_NAMES.has(entry.name))
    const byDate = sort === 'date'
    // Per ordinare per data si leggono le date di tutte le voci (entro un tetto) prima di tagliare l'elenco.
    const considered = visible.slice(0, byDate ? MAX_SORTED_ENTRIES : MAX_LIST_ENTRIES)
    const items = await Promise.all(considered.map(async (entry) => {
      let stats = null
      try { stats = await fs.promises.stat(path.join(target, entry.name)) } catch {}
      const modified = stats ? Math.round(stats.mtimeMs) : null
      if (entry.isDirectory()) return { name: entry.name, type: 'directory', modified, project: fs.existsSync(path.join(target, entry.name, '.ow')) }
      return { name: entry.name, type: 'file', size: stats ? stats.size : null, modified }
    }))
    const byName = (left, right) => left.name.localeCompare(right.name, 'it', { sensitivity: 'base' })
    if (byDate) items.sort((left, right) => (right.modified ?? 0) - (left.modified ?? 0) || byName(left, right))
    else items.sort((left, right) => Number(right.type === 'directory') - Number(left.type === 'directory') || byName(left, right))
    return { path: relative || '.', entries: items.slice(0, MAX_LIST_ENTRIES), truncated: visible.length > MAX_LIST_ENTRIES, sort: byDate ? 'date' : 'name' }
  }

  // `absolute`: il percorso è quello (assoluto) di un documento collegato al progetto, già verificato dal chiamante.
  // `startLine`/`endLine` (da 1, estremi inclusi, numerazione delle ricerche) leggono solo quelle righe: con la sola `startLine` ne seguono 50.
  async function readFile(relativePath, { offset = 0, limit = DEFAULT_READ_CHARS, absolute = false, startLine, endLine } = {}) {
    const { target, relative } = absolute ? { target: path.resolve(String(relativePath)), relative: path.resolve(String(relativePath)) } : resolveInside(relativePath)
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
    // Le immagini incorporate (data:…;base64,…) sono centinaia di KB di testo inutile: un segnaposto sulla stessa riga (i numeri di riga restano quelli delle ricerche).
    let embedded = 0
    text = text.replace(/data:([\w.+-]+\/[\w.+-]+);base64,[A-Za-z0-9+/=]{200,}/g, (all, type) => { embedded += 1; return `data:${type};base64,[embedded image, ${all.length} characters omitted]` })

    const firstLine = Number.parseInt(startLine, 10)
    if (firstLine > 0) {
      const lines = text.split(/\r?\n/)
      const from = Math.min(firstLine, lines.length)
      const last = Number.parseInt(endLine, 10)
      const to = Math.min(lines.length, last >= from ? last : from + 49)
      let content = lines.slice(from - 1, to).join('\n')
      let stop = to
      if (content.length > MAX_READ_CHARS) { content = content.slice(0, MAX_READ_CHARS); stop = from + content.split('\n').length - 1 }
      return { path: relative, ...(embedded ? { embeddedImages: embedded } : {}), totalChars: text.length, totalLines: lines.length, startLine: from, endLine: stop, content, truncated: stop < lines.length, nextLine: stop < lines.length ? stop + 1 : null }
    }

    const start = Math.max(0, Number.parseInt(offset, 10) || 0)
    const size = Math.min(MAX_READ_CHARS, Math.max(1, Number.parseInt(limit, 10) || DEFAULT_READ_CHARS))
    const content = text.slice(start, start + size)
    const end = start + content.length
    return { path: relative, ...(embedded ? { embeddedImages: embedded } : {}), totalChars: text.length, offset: start, content, truncated: end < text.length, nextOffset: end < text.length ? end : null }
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

  // Crea un nuovo documento di testo (.md, o .txt) con il contenuto dato; non sovrascrive mai un file esistente.
  async function createFile(relativePath, content = '') {
    const requested = String(relativePath || '').trim()
    if (!requested) throw new Error(t('Invalid name'))
    const extension = path.extname(requested).toLowerCase()
    if (extension && !TEXT_DOCUMENT_EXTENSIONS.has(extension)) throw new Error(t('Only .md and .txt documents can be created'))
    const { target, relative } = resolveInside(extension ? requested : `${requested}.md`)
    const text = String(content ?? '')
    if (text.length > MAX_CREATED_CHARS) throw new Error(t('The content is too long'))
    if (fs.existsSync(target)) throw new Error(t('A file with this name already exists'))
    // Solo la stessa cartella conta (senza distinguere maiuscole): in un progetto con più repository, cartelle diverse hanno legittimamente file con lo stesso nome (README.md).
    const sibling = (await fs.promises.readdir(path.dirname(target)).catch(() => [])).find((name) => name.toLowerCase() === path.basename(target).toLowerCase())
    if (sibling) throw new Error(`${t('A file with this name already exists')}: ${sibling}`)
    await fs.promises.mkdir(path.dirname(target), { recursive: true })
    await fs.promises.writeFile(target, text, { encoding: 'utf8', flag: 'wx' })
    return { path: relative, absolute: target }
  }

  // Percorso assoluto di un file/cartella del progetto (con gli stessi divieti degli altri strumenti).
  const resolvePath = (relativePath) => resolveInside(relativePath)

  // Ricerca di testo o regex nei file (vedi project-search.cjs), dentro una cartella del progetto.
  async function search(options = {}) {
    const { target } = resolveInside(options.path || '.')
    return searchFiles({ ...options, root: getProjectPath(), start: target })
  }

  return { listDirectory, readFile, readImage, createDirectory, createFile, resolvePath, search }
}

module.exports = { createProjectTools }
