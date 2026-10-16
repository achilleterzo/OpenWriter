const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')
const { writeFileAtomic } = require('./atomic-write.cjs')
const { ownerRoot, findOwners, looseKey, looseFromKey } = require('./project-owner.cjs')

const AUTHORS = ['ai', 'user']
const MAX_PER_DOCUMENT = 500

/**
 * Segnalibri: ancore con nome in un documento, per tornarci o linkarle da altri documenti (`file.md#nome`) e per far notare qualcosa all'assistente.
 * Salvati fuori dal file Markdown, come le note: `<progetto>/.ow/bookmarks/<percorso/documento.md>.json` →
 *   [ { id, name, label, quote, prefix, suffix, note, flagged, author, createdAt, updatedAt } ]
 * `name` è il nome nel link (minuscolo, senza spazi, unico nel documento); `quote`/`prefix`/`suffix` ancorano il segnalibro al testo, così regge alle
 * modifiche del documento. `flagged`: contrassegnato per l'assistente. `note`: testo facoltativo (per sé o per l'assistente).
 */
function slugify(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '')
}

function createBookmarksStore({ getProjectPath, getMainPath = () => null }) {
  const root = (base) => path.join(base, '.ow', 'bookmarks')

  function locate(document) {
    if (!document) return null
    const project = getProjectPath()
    const resolved = path.resolve(document)
    if (project) {
      const relative = path.relative(project, resolved)
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        const base = ownerRoot(project, resolved)
        return { base, key: path.relative(base, resolved).split(path.sep).join('/') }
      }
    }
    const main = getMainPath()
    return main ? { base: path.resolve(main), key: looseKey(resolved) } : null
  }

  function fileFor(document) {
    const place = locate(document)
    if (!place) throw new Error(t('The document must be inside the project folder'))
    return path.join(root(place.base), ...place.key.split('/')) + '.json'
  }

  function read(file) {
    if (!fs.existsSync(file)) return []
    try {
      const list = JSON.parse(fs.readFileSync(file, 'utf8'))
      return Array.isArray(list) ? list : []
    } catch {
      throw new Error(t('{basename} is not valid JSON: fix it or remove it', { basename: path.basename(file) }))
    }
  }

  function write(file, list) {
    if (!list.length) { fs.rmSync(file, { force: true }); return }
    fs.mkdirSync(path.dirname(file), { recursive: true })
    writeFileAtomic(file, JSON.stringify(list, null, 2))
  }

  const text = (value, limit) => String(value ?? '').slice(0, limit)

  // Nome unico nel documento: "capitolo" → "capitolo-2" → "capitolo-3"…
  function uniqueName(list, wanted, ownId = null) {
    const base = slugify(wanted) || 'segnalibro'
    let name = base
    for (let counter = 2; list.some((item) => item.id !== ownId && item.name === name); counter += 1) name = `${base}-${counter}`
    return name
  }

  const list = (document) => read(fileFor(document))

  function add(document, input = {}) {
    if (!String(input.quote || '').trim()) throw new Error(t('The bookmark must be anchored to some text'))
    const file = fileFor(document)
    const items = read(file)
    if (items.length >= MAX_PER_DOCUMENT) throw new Error(t('Too many bookmarks in this document'))
    const label = text(input.label, 120).trim()
    const bookmark = {
      id: crypto.randomUUID(),
      name: uniqueName(items, input.name || label || input.quote),
      label,
      quote: text(input.quote, 400),
      prefix: text(input.prefix, 80),
      suffix: text(input.suffix, 80),
      note: text(input.note, 2000).trim(),
      flagged: input.flagged === true,
      author: AUTHORS.includes(input.author) ? input.author : 'user',
      createdAt: new Date().toISOString(),
      updatedAt: null,
    }
    items.push(bookmark)
    write(file, items)
    return bookmark
  }

  function update(document, id, changes = {}) {
    const file = fileFor(document)
    const items = read(file)
    const index = items.findIndex((item) => item.id === id)
    if (index === -1) throw new Error(t('Bookmark not found'))
    const current = items[index]
    const next = { ...current }
    if (changes.label !== undefined) next.label = text(changes.label, 120).trim()
    if (changes.note !== undefined) next.note = text(changes.note, 2000).trim()
    if (changes.flagged !== undefined) next.flagged = changes.flagged === true
    if (changes.name !== undefined && slugify(changes.name)) next.name = uniqueName(items, changes.name, id)
    // Per riallineare il segnalibro dopo una modifica del testo.
    if (changes.quote !== undefined && String(changes.quote).trim()) {
      next.quote = text(changes.quote, 400)
      next.prefix = text(changes.prefix, 80)
      next.suffix = text(changes.suffix, 80)
    }
    next.updatedAt = new Date().toISOString()
    items[index] = next
    write(file, items)
    return next
  }

  function remove(document, id) {
    const file = fileFor(document)
    write(file, read(file).filter((item) => item.id !== id))
    return true
  }

  // Tutti i segnalibri del progetto, anche dei sotto-progetti: [{ path, absolute, bookmarks }].
  function listAll() {
    const project = getProjectPath()
    if (!project) throw new Error(t('No project open'))
    const result = []
    const walk = (directory, base) => {
      let entries = []
      try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) walk(full, base)
        else if (entry.name.endsWith('.json')) {
          try {
            const bookmarks = read(full)
            if (!bookmarks.length) continue
            const inBase = path.relative(root(base), full).slice(0, -'.json'.length)
            const relative = path.relative(project, path.join(base, inBase)).split(path.sep).join('/')
            const absolute = looseFromKey(inBase.split(path.sep).join('/'))
            result.push({ path: absolute || relative, absolute: Boolean(absolute), bookmarks })
          } catch { /* file illeggibile: ignorato */ }
        }
      }
    }
    for (const base of [path.resolve(project), ...findOwners(project)]) walk(root(base), base)
    return result
  }

  // Segue la rinomina o lo spostamento di un documento o di una cartella.
  function move(from, to) {
    const source = locate(from)
    const target = locate(to)
    if (!source || !target) return false
    let moved = false
    const sourceRoot = root(source.base)
    const targetRoot = root(target.base)
    for (const [sourcePath, destination] of [
      [path.join(sourceRoot, ...source.key.split('/')) + '.json', path.join(targetRoot, ...target.key.split('/')) + '.json'],
      [path.join(sourceRoot, ...source.key.split('/')), path.join(targetRoot, ...target.key.split('/'))],
    ]) {
      if (fs.existsSync(sourcePath) && !fs.existsSync(destination)) {
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        try {
          fs.renameSync(sourcePath, destination)
        } catch (error) {
          if (error.code !== 'EXDEV') throw error
          fs.cpSync(sourcePath, destination, { recursive: true })
          fs.rmSync(sourcePath, { recursive: true, force: true })
        }
        moved = true
      }
    }
    return moved
  }

  return { list, add, update, remove, listAll, move }
}

module.exports = { createBookmarksStore, slugify }
