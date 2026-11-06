const fs = require('node:fs/promises')
const path = require('node:path')

/**
 * Allinea l'indice di ricerca (knowledge-index.cjs) con i file del progetto. Gira nel worker (knowledge-worker.cjs), ma non dipende da esso:
 * si prova con un indice in memoria e una cartella temporanea.
 *
 * Si indicizzano i documenti di testo (.md, .markdown, .mdown, .txt) con gli stessi limiti della ricerca nei file: niente file nascosti (nome
 * che comincia con "."), niente `.ow`, `.git`, `node_modules` e le cartelle nascoste dell'esploratore, al massimo 2 MB per file e 20.000 file visitati.
 */
const INDEXED_EXTENSIONS = new Set(['.md', '.markdown', '.mdown', '.txt'])
const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_VISITED_FILES = 20000

const toRelative = (project, absolute) => path.relative(project, absolute).split(path.sep).join('/')
const isIndexableName = (name) => !name.startsWith('.') && INDEXED_EXTENSIONS.has(path.extname(name).toLowerCase())
const isSkippedDirectory = (name, hidden) => name.startsWith('.') || name === 'node_modules' || hidden.has(name)

// Elenco ricorsivo dei documenti sotto `base` (assoluto): Map percorso relativo → { mtimeMs, size }.
async function walk(project, base, hidden, found = new Map(), counter = { visited: 0 }) {
  let entries
  try { entries = await fs.readdir(base, { withFileTypes: true }) } catch { return found }
  for (const entry of entries) {
    if (counter.visited >= MAX_VISITED_FILES) return found
    const full = path.join(base, entry.name)
    if (entry.isDirectory()) {
      if (!isSkippedDirectory(entry.name, hidden)) await walk(project, full, hidden, found, counter)
    } else if (entry.isFile() && isIndexableName(entry.name)) {
      counter.visited += 1
      try {
        const stat = await fs.stat(full)
        if (stat.size <= MAX_FILE_BYTES) found.set(toRelative(project, full), { mtimeMs: Math.round(stat.mtimeMs), size: stat.size })
      } catch { /* sparito nel frattempo */ }
    }
  }
  return found
}

async function indexOne(index, project, relative, info) {
  try {
    const text = await fs.readFile(path.join(project, ...relative.split('/')), 'utf8')
    index.indexFile(project, relative, text, info)
    return true
  } catch {
    // Illeggibile o sparito: non deve restare nell'indice.
    index.removeFile(project, relative)
    return false
  }
}

// Allinea tutto quello che sta sotto `relativeBase` ('' = l'intero progetto): legge solo i file nuovi o cambiati, toglie quelli spariti.
async function syncTree(index, project, relativeBase = '', hidden = new Set()) {
  const base = relativeBase ? path.join(project, ...relativeBase.split('/')) : project
  const found = await walk(project, base, hidden)
  const prefix = relativeBase ? `${relativeBase}/` : ''
  const known = index.listFiles(project)
  const summary = { indexed: 0, removed: 0, unchanged: 0 }
  for (const [relative, info] of found) {
    const before = known.get(relative)
    if (before && before.mtimeMs === info.mtimeMs && before.size === info.size) { summary.unchanged += 1; continue }
    if (await indexOne(index, project, relative, info)) summary.indexed += 1
  }
  for (const relative of known.keys()) {
    if ((prefix && !relative.startsWith(prefix)) || found.has(relative)) continue
    if (index.removeFile(project, relative)) summary.removed += 1
  }
  return summary
}

// Percorsi indicati da chi sorveglia la cartella (relativi, con "/"): un file, una cartella, o qualcosa che non esiste più.
async function syncPaths(index, project, relatives, hidden = new Set()) {
  const summary = { indexed: 0, removed: 0, unchanged: 0 }
  const add = (part) => { for (const key of Object.keys(summary)) summary[key] += part[key] }
  for (const relative of relatives) {
    const parts = relative.split('/')
    if (parts.some((part) => part.startsWith('.') || part === 'node_modules' || hidden.has(part))) {
      // Un file con nome nascosto non si indicizza, ma se ci era finito (era stato rinominato così) va tolto.
      if (parts.some((part) => part.startsWith('.'))) summary.removed += index.removePath(project, relative)
      continue
    }
    let stat = null
    try { stat = await fs.lstat(path.join(project, ...parts)) } catch { /* non esiste più */ }
    if (!stat) { summary.removed += index.removePath(project, relative); continue }
    if (stat.isDirectory()) { add(await syncTree(index, project, relative, hidden)); continue }
    if (!stat.isFile() || !isIndexableName(parts[parts.length - 1])) { summary.removed += index.removeFile(project, relative) ? 1 : 0; continue }
    if (stat.size > MAX_FILE_BYTES) { summary.removed += index.removeFile(project, relative) ? 1 : 0; continue }
    const info = { mtimeMs: Math.round(stat.mtimeMs), size: stat.size }
    // Se il testo non è cambiato, indexFile lo riconosce dall'hash e non rifà i frammenti.
    if (await indexOne(index, project, relative, info)) summary.indexed += 1
  }
  return summary
}

module.exports = { syncTree, syncPaths, isIndexableName, INDEXED_EXTENSIONS, MAX_FILE_BYTES, MAX_VISITED_FILES }
