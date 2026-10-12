const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')

const KINDS = ['comment', 'suggestion']
const STATUSES = ['open', 'accepted', 'rejected', 'resolved']
const AUTHORS = ['ai', 'user']

/**
 * Note azionabili ancorate al testo di un documento, salvate fuori dal file Markdown per non sporcarlo:
 *   `<progetto>/.ow/notes/<percorso/documento.md>.json` → [ { id, kind, quote, prefix, suffix, body, replacement, status, author, createdAt, resolvedAt } ]
 * `quote` è il testo ancorato; `prefix`/`suffix` servono a ritrovarlo se compare più volte.
 * `kind` = 'comment' (osservazione) oppure 'suggestion' (con `replacement` da accettare o rifiutare).
 */
function createNotesStore({ getProjectPath }) {
  const root = () => {
    const project = getProjectPath()
    if (!project) throw new Error(t('No project open'))
    return path.join(project, '.ow', 'notes')
  }

  function documentKey(document) {
    const project = getProjectPath()
    if (!project || !document) return null
    const relative = path.relative(project, path.resolve(document))
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return null
    return relative.split(path.sep).join('/')
  }

  function fileFor(document) {
    const key = documentKey(document)
    if (!key) throw new Error(t('The document must be inside the project folder'))
    return path.join(root(), ...key.split('/')) + '.json'
  }

  function writeAtomic(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const temporary = `${file}.tmp`
    fs.writeFileSync(temporary, content)
    fs.renameSync(temporary, file)
  }

  function readNotes(file) {
    if (!fs.existsSync(file)) return []
    try {
      const notes = JSON.parse(fs.readFileSync(file, 'utf8'))
      return Array.isArray(notes) ? notes : []
    } catch {
      throw new Error(t('{basename} is not valid JSON: fix it or remove it', { basename: path.basename(file) }))
    }
  }

  const text = (value, limit) => String(value ?? '').slice(0, limit)

  function normalize(input, existing = {}) {
    const kind = KINDS.includes(input.kind) ? input.kind : existing.kind || 'comment'
    const replacement = input.replacement === undefined ? existing.replacement : input.replacement
    return {
      id: existing.id || input.id || crypto.randomUUID(),
      kind,
      quote: text(input.quote ?? existing.quote, 2000),
      prefix: text(input.prefix ?? existing.prefix, 80),
      suffix: text(input.suffix ?? existing.suffix, 80),
      body: text(input.body ?? existing.body, 4000),
      replacement: kind === 'suggestion' && replacement !== null && replacement !== undefined ? text(replacement, 4000) : null,
      status: STATUSES.includes(input.status) ? input.status : existing.status || 'open',
      author: AUTHORS.includes(input.author) ? input.author : existing.author || 'user',
      createdAt: existing.createdAt || new Date().toISOString(),
      updatedAt: existing.updatedAt ?? null,
      resolvedAt: (STATUSES.includes(input.status) ? input.status : existing.status || 'open') === 'open' ? null : existing.resolvedAt || new Date().toISOString(),
    }
  }

  const list = (document) => readNotes(fileFor(document))

  function add(document, input) {
    if (!input?.quote) throw new Error(t('The note must be anchored to some text'))
    const file = fileFor(document)
    const notes = readNotes(file)
    const note = normalize({ ...input, id: undefined, status: 'open' })
    notes.push(note)
    writeAtomic(file, JSON.stringify(notes, null, 2))
    return note
  }

  function update(document, id, changes) {
    const file = fileFor(document)
    const notes = readNotes(file)
    const index = notes.findIndex((note) => note.id === id)
    if (index === -1) throw new Error(t('Note not found'))
    // L'autore non si modifica: cambiano contenuto, stato, (comment → suggestion) il tipo e, per riallinearla dopo una modifica del testo, l'ancora.
    const { body, replacement, status, kind, quote, prefix, suffix } = changes || {}
    notes[index] = { ...normalize({ ...notes[index], body, replacement, status, kind, quote, prefix, suffix }, notes[index]), updatedAt: new Date().toISOString() }
    writeAtomic(file, JSON.stringify(notes, null, 2))
    return notes[index]
  }

  function remove(document, id) {
    const file = fileFor(document)
    const notes = readNotes(file).filter((note) => note.id !== id)
    if (notes.length) writeAtomic(file, JSON.stringify(notes, null, 2))
    else fs.rmSync(file, { force: true })
    return true
  }

  // Tutte le note del progetto: [{ path, notes }].
  function listAll() {
    const base = root()
    const result = []
    const walk = (directory) => {
      let entries = []
      try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return }
      for (const entry of entries) {
        const full = path.join(directory, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (entry.name.endsWith('.json')) {
          try {
            const notes = readNotes(full)
            if (notes.length) result.push({ path: path.relative(base, full).slice(0, -'.json'.length).split(path.sep).join('/'), notes })
          } catch {}
        }
      }
    }
    walk(base)
    return result
  }

  // Segue la rinomina di un documento o di una cartella.
  function move(from, to) {
    const fromKey = documentKey(from)
    const toKey = documentKey(to)
    if (!fromKey || !toKey) return false
    let moved = false
    for (const [source, destination] of [
      [path.join(root(), ...fromKey.split('/')) + '.json', path.join(root(), ...toKey.split('/')) + '.json'],
      [path.join(root(), ...fromKey.split('/')), path.join(root(), ...toKey.split('/'))],
    ]) {
      if (fs.existsSync(source) && !fs.existsSync(destination)) {
        fs.mkdirSync(path.dirname(destination), { recursive: true })
        fs.renameSync(source, destination)
        moved = true
      }
    }
    return moved
  }

  return { list, listAll, add, update, remove, move }
}

module.exports = { createNotesStore }
