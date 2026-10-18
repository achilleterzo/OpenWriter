const fs = require('node:fs')
const path = require('node:path')
const { isSameOrInside, samePath } = require('./path-compare.cjs')
const { t } = require('./i18n.cjs')
const { writeFileAtomic } = require('./atomic-write.cjs')

const MAX_REFERENCES = 20

/**
 * Cartelle di riferimento di un progetto: cartelle che stanno fuori dal progetto, collegate senza copiarle, che l'assistente può solo leggere.
 *   `<progetto>/.ow/references.json` → [ { name, path (assoluto), addedAt } ]
 * `name` è la sigla con cui l'assistente le indica (`@name/sottocartella/file.md`): unica nel progetto, ricavata dal nome della cartella.
 * Una cartella che non c'è più resta in elenco, segnalata (`missing`), e si può ricollegare a un'altra posizione tenendo la stessa sigla.
 */
const isInside = isSameOrInside

function readReferences(project) {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(project, '.ow', 'references.json'), 'utf8'))
    return (Array.isArray(list) ? list : []).filter((item) => item && typeof item.name === 'string' && typeof item.path === 'string' && path.isAbsolute(item.path))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw new Error(t('{basename} is not valid JSON: fix it or remove it', { basename: 'references.json' }))
  }
}

function writeReferences(project, list) {
  const file = path.join(project, '.ow', 'references.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  writeFileAtomic(file, JSON.stringify(list, null, 2))
}

// Sigla senza caratteri che confonderebbero un percorso (`@sigla/…`).
const cleanName = (value) => String(value || '').normalize('NFC').replace(/[\\/:*?"<>|@\s]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'reference'

function createReferencesStore({ getProjectPath }) {
  const project = () => {
    const current = getProjectPath()
    if (!current) throw new Error(t('No project open'))
    return path.resolve(current)
  }

  // Cartella da collegare, controllata: assoluta, esistente, né la radice del disco né il progetto stesso (o dentro di esso, o un suo antenato).
  function checked(directory) {
    const given = String(directory || '')
    if (!path.isAbsolute(given)) throw new Error(t('Choose a folder'))
    const absolute = path.resolve(given)
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) throw new Error(t('Folder not found: {path}', { path: absolute }))
    if (path.parse(absolute).root === absolute) throw new Error(t('This folder cannot be used as a reference'))
    if (isInside(project(), absolute) || isInside(absolute, project())) throw new Error(t('A reference must be a folder outside the project'))
    return absolute
  }

  function list() {
    return readReferences(project()).map((item) => {
      let missing = true
      try { missing = !fs.statSync(item.path).isDirectory() } catch { /* cartella mancante */ }
      return { name: item.name, path: item.path, missing }
    })
  }

  const uniqueName = (base, current) => {
    let name = base
    for (let counter = 2; current.some((item) => item.name.toLowerCase() === name.toLowerCase()); counter += 1) name = `${base}-${counter}`
    return name
  }

  function add(directory) {
    const absolute = checked(directory)
    const current = readReferences(project())
    if (current.some((item) => samePath(item.path, absolute))) return list()
    if (current.length >= MAX_REFERENCES) throw new Error(t('Too many reference folders (max {count})', { count: MAX_REFERENCES }))
    current.push({ name: uniqueName(cleanName(path.basename(absolute)), current), path: absolute, addedAt: new Date().toISOString() })
    writeReferences(project(), current)
    return list()
  }

  // Il riferimento punta a un'altra cartella (quella originale è stata spostata o rinominata): la sigla resta la stessa.
  function update(name, directory) {
    const absolute = checked(directory)
    const current = readReferences(project())
    const index = current.findIndex((item) => item.name === name)
    if (index === -1) throw new Error(t('Reference not found'))
    if (current.some((item, position) => position !== index && samePath(item.path, absolute))) throw new Error(t('This folder is already a reference'))
    current[index] = { ...current[index], path: absolute }
    writeReferences(project(), current)
    return list()
  }

  function remove(name) {
    writeReferences(project(), readReferences(project()).filter((item) => item.name !== name))
    return list()
  }

  // `@sigla/percorso/relativo` → { name, root, relative } se la sigla è un riferimento esistente; null se il percorso non comincia con `@`.
  function resolve(reference) {
    const value = String(reference || '')
    if (!value.startsWith('@')) return null
    const [name, ...rest] = value.slice(1).replace(/\\/g, '/').split('/')
    const item = readReferences(project()).find((entry) => entry.name.toLowerCase() === name.toLowerCase())
    if (!item) throw new Error(t('Reference folder "@{name}" not found: the root listing shows the available ones', { name }))
    if (!fs.existsSync(item.path) || !fs.statSync(item.path).isDirectory()) throw new Error(t('The folder of reference "@{name}" is missing: the user has to relink it', { name: item.name }))
    return { name: item.name, root: item.path, relative: rest.filter(Boolean).join('/') }
  }

  const get = (name) => readReferences(project()).find((item) => item.name === name) || null

  return { list, add, update, remove, resolve, get }
}

module.exports = { createReferencesStore }
