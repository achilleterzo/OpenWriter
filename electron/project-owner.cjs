const fs = require('node:fs')
const path = require('node:path')

const DIRECTORY_NAME = '.ow'
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'out'])
const MAX_SCAN_DEPTH = 8

const isDirectory = (target) => { try { return fs.statSync(target).isDirectory() } catch { return false } }
const hasOw = (directory) => isDirectory(path.join(directory, DIRECTORY_NAME))
const isInside = (root, target) => {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

/**
 * Regola "della `.ow` più vicina", come per Git: cronologia e note di un file appartengono alla `.ow` più vicina,
 * risalendo dalla cartella del file fino alla radice del progetto aperto (che è sempre l'ultimo proprietario possibile).
 * Un sotto-progetto è quindi una cartella con una `.ow` propria; il progetto aperto non guarda mai oltre la propria radice.
 * Si parte dalla cartella che contiene `target`: la `.ow` di una cartella non la riguarda come elemento del padre.
 */
function ownerRoot(project, target) {
  const root = path.resolve(project)
  let directory = path.dirname(path.resolve(target))
  while (directory !== root && isInside(root, directory)) {
    if (hasOw(directory)) return directory
    const parent = path.dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return root
}

// Sotto-progetti del progetto: tutte le cartelle con una `.ow` propria, a qualunque profondità (la radice è esclusa).
function findOwners(project) {
  const root = path.resolve(project)
  const found = []
  const walk = (directory, depth) => {
    if (depth > MAX_SCAN_DEPTH) return
    let entries = []
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || SKIPPED_DIRECTORIES.has(entry.name)) continue
      const full = path.join(directory, entry.name)
      if (hasOw(full)) found.push(full)
      walk(full, depth + 1)
    }
  }
  walk(root, 0)
  return found
}

// La `.ow` più vicina sopra `directory` (anche fuori dal progetto aperto), per l'ereditarietà del contesto; null se non ce n'è.
function parentOwner(directory) {
  let current = path.dirname(path.resolve(directory))
  for (let guard = 0; guard < 64; guard += 1) {
    if (hasOw(current)) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
  return null
}

module.exports = { ownerRoot, findOwners, parentOwner, isInside }
