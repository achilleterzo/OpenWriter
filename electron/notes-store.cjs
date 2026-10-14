const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')
const { ownerRoot, findOwners, looseKey, looseFromKey } = require('./project-owner.cjs')

const KINDS = ['comment', 'suggestion']
const STATUSES = ['open', 'accepted', 'rejected', 'resolved']
const AUTHORS = ['ai', 'user']

/**
 * Note azionabili ancorate al testo di un documento, salvate fuori dal file Markdown per non sporcarlo:
 *   `<progetto>/.ow/notes/<percorso/documento.md>.json` → [ { id, kind, quote, prefix, suffix, body, replacement, status, author, createdAt, resolvedAt } ]
 * Il percorso è relativo alla `.ow` più vicina al documento (vedi project-owner.cjs): le note di un file di un sotto-progetto stanno nel sotto-progetto.
 * `quote` è il testo ancorato; `prefix`/`suffix` servono a ritrovarlo se compare più volte.
 * `kind` = 'comment' (osservazione) oppure 'suggestion' (con `replacement` da accettare o rifiutare).
 */
function createNotesStore({ getProjectPath, getMainPath = () => null }) {
  const notesRoot = (base) => path.join(base, '.ow', 'notes')

  // Dove stanno le note di un documento: { base: cartella proprietaria della `.ow`, key: percorso relativo a base con "/" };
  // un documento fuori dal progetto aperto sta nel progetto main (vedi looseKey).
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
    return path.join(notesRoot(place.base), ...place.key.split('/')) + '.json'
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

  // Tutte le note del progetto, anche quelle dei sotto-progetti: [{ path (relativo al progetto), notes }].
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
            const notes = readNotes(full)
            if (!notes.length) continue
            const inBase = path.relative(notesRoot(base), full).slice(0, -'.json'.length)
            const relative = path.relative(project, path.join(base, inBase)).split(path.sep).join('/')
            // Le note dei documenti sparsi (progetto main) si presentano con il percorso assoluto del documento.
            const absolute = looseFromKey(inBase.split(path.sep).join('/'))
            result.push({ path: absolute || relative, absolute: Boolean(absolute), notes })
          } catch {}
        }
      }
    }
    for (const base of [path.resolve(project), ...findOwners(project)]) walk(notesRoot(base), base)
    return result
  }

  // Segue la rinomina o lo spostamento di un documento o di una cartella; se passa a un altro progetto le note lo seguono nella nuova `.ow`.
  function move(from, to) {
    const source = locate(from)
    const target = locate(to)
    if (!source || !target) return false
    let moved = false
    const sourceRoot = notesRoot(source.base)
    const targetRoot = notesRoot(target.base)
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

  return { list, listAll, add, update, remove, move }
}

module.exports = { createNotesStore }
