const fs = require('node:fs')
const path = require('node:path')
const { t } = require('./i18n.cjs')

const MARKDOWN_PATTERN = /\.(md|markdown|mdown)$/i
const MAX_LINKS = 200

/**
 * Documenti collegati a un progetto: file Markdown che stanno fuori dalla sua cartella e che il progetto punta senza copiarli.
 *   `<progetto>/.ow/links.json` → [ { path (assoluto), addedAt } ]
 * Si modifica sempre l'originale: nessuna copia. Cronologia e note restano legate al percorso del file (come per ogni documento sparso).
 */
const samePath = (left, right) => path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase()

function readLinks(project) {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(project, '.ow', 'links.json'), 'utf8'))
    return (Array.isArray(list) ? list : []).filter((item) => item && typeof item.path === 'string' && path.isAbsolute(item.path))
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw new Error(t('{basename} is not valid JSON: fix it or remove it', { basename: 'links.json' }))
  }
}

function writeLinks(project, list) {
  const file = path.join(project, '.ow', 'links.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.tmp`
  fs.writeFileSync(temporary, JSON.stringify(list, null, 2))
  fs.renameSync(temporary, file)
}

// Percorsi da collegare, controllati: assoluti, esistenti, file Markdown, fuori dal progetto, senza doppioni.
function checkedPaths(project, paths) {
  const result = []
  for (const given of Array.isArray(paths) ? paths : []) {
    const absolute = path.resolve(String(given || ''))
    if (!path.isAbsolute(String(given || '')) || !MARKDOWN_PATTERN.test(absolute)) throw new Error(t('Only Markdown documents saved on disk can be linked: {path}', { path: String(given) }))
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw new Error(t('File not found: {path}', { path: absolute }))
    if (project) {
      const relative = path.relative(project, absolute)
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) continue
    }
    if (!result.some((item) => samePath(item, absolute))) result.push(absolute)
  }
  return result.slice(0, MAX_LINKS)
}

function createLinksStore({ getProjectPath }) {
  const project = () => {
    const current = getProjectPath()
    if (!current) throw new Error(t('No project open'))
    return path.resolve(current)
  }

  // [{ path, name, missing }]: un collegamento a un file che non c'è più resta in elenco, segnalato.
  function list() {
    return readLinks(project()).map((item) => ({ path: item.path, name: path.basename(item.path), missing: !fs.existsSync(item.path) }))
  }

  const has = (target) => Boolean(getProjectPath()) && typeof target === 'string' && path.isAbsolute(target) && readLinks(project()).some((item) => samePath(item.path, target))

  function add(paths) {
    const current = readLinks(project())
    for (const absolute of checkedPaths(project(), paths)) {
      if (!current.some((item) => samePath(item.path, absolute))) current.push({ path: absolute, addedAt: new Date().toISOString() })
    }
    writeLinks(project(), current.slice(0, MAX_LINKS))
    return list()
  }

  // Il collegamento punta a un altro file (es. quello originale è stato spostato o rinominato): resta nella stessa posizione dell'elenco.
  function update(from, to) {
    const [absolute] = checkedPaths(project(), [to])
    if (!absolute) throw new Error(t('Only Markdown documents saved on disk can be linked: {path}', { path: String(to) }))
    const current = readLinks(project())
    const index = current.findIndex((item) => samePath(item.path, String(from)))
    if (index === -1) throw new Error(t('Link not found'))
    current[index] = { ...current[index], path: absolute }
    // Se il nuovo file era già collegato, resta una voce sola (quella aggiornata).
    writeLinks(project(), current.filter((item, position) => position === index || !samePath(item.path, absolute)))
    return list()
  }

  function remove(target) {
    writeLinks(project(), readLinks(project()).filter((item) => !samePath(item.path, String(target))))
    return list()
  }

  return { list, has, add, update, remove }
}

// Collega documenti a un progetto che non è (ancora) quello aperto: serve a crearne uno già con i suoi collegamenti.
function writeLinksTo(projectDirectory, paths) {
  const project = path.resolve(projectDirectory)
  const checked = checkedPaths(project, paths)
  writeLinks(project, checked.map((absolute) => ({ path: absolute, addedAt: new Date().toISOString() })))
  return checked
}

module.exports = { createLinksStore, writeLinksTo, checkedPaths }
