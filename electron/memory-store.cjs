const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')

const AUTHORS = ['ai', 'user']
const MAX_ENTRIES = 300

/**
 * Memoria del progetto: informazioni importanti (decisioni, terminologia, scelte di stile…) salvate in `.ow/memory.json` come
 *   [ { id, title, text, files: ['percorso/relativo.md'], author: 'ai' | 'user', createdAt, updatedAt } ]
 * Ogni voce porta con sé i file a cui si applica (percorsi relativi al progetto, che seguono gli spostamenti).
 */
function createMemoryStore({ getProjectPath }) {
  const file = () => {
    const project = getProjectPath()
    if (!project) throw new Error(t('No project open'))
    return path.join(project, '.ow', 'memory.json')
  }

  function read() {
    try {
      const list = JSON.parse(fs.readFileSync(file(), 'utf8'))
      return Array.isArray(list) ? list : []
    } catch (error) {
      if (error.code === 'ENOENT') return []
      throw new Error(t('{basename} is not valid JSON: fix it or remove it', { basename: 'memory.json' }))
    }
  }

  function write(list) {
    const target = file()
    fs.mkdirSync(path.dirname(target), { recursive: true })
    const temporary = `${target}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(list, null, 2))
    fs.renameSync(temporary, target)
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

  const list = () => read()

  function add({ title, text: body, files, author } = {}) {
    if (!text(body, 4000)) throw new Error(t('The memory text is empty'))
    const entries = read()
    if (entries.length >= MAX_ENTRIES) throw new Error(t('The memory is full: remove some entries first'))
    const now = new Date().toISOString()
    const entry = { id: crypto.randomUUID(), title: text(title, 120), text: text(body, 4000), files: cleanFiles(files), author: AUTHORS.includes(author) ? author : 'user', createdAt: now, updatedAt: now }
    entries.push(entry)
    write(entries)
    return entry
  }

  function update(id, changes = {}) {
    const entries = read()
    const index = entries.findIndex((entry) => entry.id === id)
    if (index === -1) throw new Error(t('Memory entry not found'))
    const current = entries[index]
    const next = { ...current }
    if (changes.title !== undefined) next.title = text(changes.title, 120)
    if (changes.text !== undefined) {
      next.text = text(changes.text, 4000)
      if (!next.text) throw new Error(t('The memory text is empty'))
    }
    if (changes.files !== undefined) next.files = cleanFiles(changes.files)
    next.updatedAt = new Date().toISOString()
    entries[index] = next
    write(entries)
    return next
  }

  function remove(id) {
    const entries = read()
    const remaining = entries.filter((entry) => entry.id !== id)
    if (remaining.length === entries.length) return false
    write(remaining)
    return true
  }

  // Un file o una cartella è stato spostato/rinominato: i riferimenti nelle voci lo seguono.
  function renameFile(from, to) {
    const source = String(from || '').replace(/\\/g, '/')
    const target = String(to || '').replace(/\\/g, '/')
    if (!source || !target) return
    let entries
    try { entries = read() } catch { return }
    let changed = false
    for (const entry of entries) {
      entry.files = (entry.files || []).map((item) => {
        if (item === source) { changed = true; return target }
        if (item.startsWith(`${source}/`)) { changed = true; return target + item.slice(source.length) }
        return item
      })
    }
    if (changed) write(entries)
  }

  return { list, add, update, remove, renameFile }
}

module.exports = { createMemoryStore }
