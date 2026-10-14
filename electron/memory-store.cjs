const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')
const { writeFileAtomic } = require('./atomic-write.cjs')
const { ownerRoot, findOwners, isInside } = require('./project-owner.cjs')

const AUTHORS = ['ai', 'user']
const MAX_ENTRIES = 300

/**
 * Memoria del progetto: informazioni importanti (decisioni, terminologia, scelte di stile…) salvate in `.ow/memory.json` come
 *   [ { id, title, text, files: ['percorso/relativo.md'], author: 'ai' | 'user', createdAt, updatedAt } ]
 * Ogni voce porta con sé i file a cui si applica. Una voce sta nella `.ow` più vicina ai suoi file (vedi project-owner.cjs) e sul disco
 * i percorsi sono relativi a quella `.ow`; chi usa l'archivio vede invece percorsi relativi al progetto aperto e un campo `origin`
 * (percorso del progetto proprietario relativo al progetto aperto, '' per il progetto stesso).
 */
function createMemoryStore({ getProjectPath }) {
  const project = () => {
    const current = getProjectPath()
    if (!current) throw new Error(t('No project open'))
    return path.resolve(current)
  }
  const memoryFile = (base) => path.join(base, '.ow', 'memory.json')
  const posix = (value) => value.split(path.sep).join('/')
  const originOf = (base) => posix(path.relative(project(), base))
  // Il progetto aperto e i suoi sotto-progetti.
  const owners = () => [project(), ...findOwners(project())]

  function readAt(base) {
    try {
      const list = JSON.parse(fs.readFileSync(memoryFile(base), 'utf8'))
      return Array.isArray(list) ? list : []
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw new Error(t('{basename} is not valid JSON: fix it or remove it', { basename: 'memory.json' }))
    }
  }

  function writeAt(base, list) {
    const target = memoryFile(base)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    writeFileAtomic(target, JSON.stringify(list, null, 2))
  }

  const text = (value, limit) => String(value ?? '').trim().slice(0, limit)

  // Percorsi relativi al progetto, con "/" e senza uscire dalla cartella; niente doppioni.
  function cleanFiles(files) {
    const result = []
    for (const item of Array.isArray(files) ? files : []) {
      const value = String(item || '').replace(/\\/g, '/').replace(/^\/+/, '').trim()
      if (!value || value.split('/').some((part) => part === '..' || part === '.ow') || result.includes(value)) continue
      result.push(value)
    }
    return result.slice(0, 20)
  }

  // Proprietario di una voce nuova: la `.ow` comune più vicina ai file collegati; senza file, o con file di progetti diversi, il progetto aperto.
  function ownerFor(files) {
    const bases = new Set(files.map((file) => ownerRoot(project(), path.join(project(), file))))
    return bases.size === 1 ? [...bases][0] : project()
  }

  // Dal progetto aperto al proprietario, e ritorno.
  const toOwner = (base, files) => files.map((file) => posix(path.relative(base, path.join(project(), file))))
  const toProject = (base, files) => (files || []).map((file) => posix(path.relative(project(), path.join(base, file))))
  const present = (base, entry) => ({ ...entry, files: toProject(base, entry.files), origin: originOf(base) })

  function list() {
    return owners().flatMap((base) => readAt(base).map((entry) => present(base, entry)))
  }

  function find(id) {
    for (const base of owners()) {
      const entries = readAt(base)
      const index = entries.findIndex((entry) => entry.id === id)
      if (index !== -1) return { base, entries, index }
    }
    return null
  }

  function add({ title, text: body, files, author } = {}) {
    if (!text(body, 4000)) throw new Error(t('The memory text is empty'))
    const linked = cleanFiles(files)
    const base = ownerFor(linked)
    const entries = readAt(base)
    if (entries.length >= MAX_ENTRIES) throw new Error(t('The memory is full: remove some entries first'))
    const now = new Date().toISOString()
    const entry = { id: crypto.randomUUID(), title: text(title, 120), text: text(body, 4000), files: toOwner(base, linked), author: AUTHORS.includes(author) ? author : 'user', createdAt: now, updatedAt: now }
    entries.push(entry)
    writeAt(base, entries)
    return present(base, entry)
  }

  function update(id, changes = {}) {
    const found = find(id)
    if (!found) throw new Error(t('Memory entry not found'))
    const { base, entries, index } = found
    const next = { ...entries[index] }
    if (changes.title !== undefined) next.title = text(changes.title, 120)
    if (changes.text !== undefined) {
      next.text = text(changes.text, 4000)
      if (!next.text) throw new Error(t('The memory text is empty'))
    }
    let target = base
    if (changes.files !== undefined) {
      const linked = cleanFiles(changes.files)
      // Se i nuovi file stanno in un altro progetto, la voce li segue.
      target = linked.length ? ownerFor(linked) : base
      next.files = toOwner(target, linked)
    }
    next.updatedAt = new Date().toISOString()
    if (target === base) {
      entries[index] = next
      writeAt(base, entries)
    } else {
      entries.splice(index, 1)
      writeAt(base, entries)
      writeAt(target, [...readAt(target), next])
    }
    return present(target, next)
  }

  function remove(id) {
    const found = find(id)
    if (!found) return false
    found.entries.splice(found.index, 1)
    writeAt(found.base, found.entries)
    return true
  }

  // Un file o una cartella è stato spostato/rinominato (percorsi assoluti, già sul disco nella nuova posizione):
  // i riferimenti nelle voci lo seguono, e passano alla memoria del nuovo progetto se l'elemento ne cambia.
  function relocate(from, to) {
    const root = project()
    const source = path.resolve(from)
    const destination = path.resolve(to)
    const sourceOwner = ownerRoot(root, source)
    const destinationOwner = ownerRoot(root, destination)
    for (const base of owners()) {
      if (!isInside(base, source)) continue
      const relFrom = posix(path.relative(base, source))
      const inPlace = isInside(base, destination) ? posix(path.relative(base, destination)) : null
      const migrating = base === sourceOwner && destinationOwner !== sourceOwner
      if (!migrating && inPlace === null) continue
      let entries
      try { entries = readAt(base) } catch { continue }
      const remap = (item) => (item === relFrom ? '' : item.startsWith(`${relFrom}/`) ? item.slice(relFrom.length) : null)
      if (!migrating) {
        let changed = false
        for (const entry of entries) {
          entry.files = (entry.files || []).map((item) => {
            const rest = remap(item)
            if (rest === null) return item
            changed = true
            return inPlace + rest
          })
        }
        if (changed) writeAt(base, entries)
        continue
      }
      const incoming = []
      const kept = []
      for (const entry of entries) {
        const moved = []
        const remaining = []
        for (const item of entry.files || []) {
          const rest = remap(item)
          if (rest === null) remaining.push(item)
          else moved.push(posix(path.relative(destinationOwner, path.join(destination, rest ? `.${rest}` : ''))))
        }
        if (!moved.length) { kept.push(entry); continue }
        // Una voce che riguardava solo l'elemento spostato lo segue; se riguardava anche altri file se ne crea una copia nella nuova memoria.
        if (!remaining.length) incoming.push({ ...entry, files: moved })
        else { kept.push({ ...entry, files: remaining }); incoming.push({ ...entry, id: crypto.randomUUID(), files: moved }) }
      }
      if (!incoming.length) continue
      writeAt(destinationOwner, [...readAt(destinationOwner), ...incoming])
      writeAt(base, kept)
    }
  }

  return { list, add, update, remove, relocate }
}

module.exports = { createMemoryStore }
