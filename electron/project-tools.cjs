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
    const entries = await fs.promises.readdir(target, { withFileTypes: true })
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
    const stats = await fs.promises.stat(target)
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

  return { listDirectory, readFile, readImage }
}

module.exports = { createProjectTools }
