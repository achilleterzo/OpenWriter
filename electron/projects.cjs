const fs = require('node:fs')
const path = require('node:path')
const { samePath } = require('./path-compare.cjs')

const MAX_PROJECTS = 100

/**
 * Elenco dei progetti conosciuti (cartelle di lavoro), salvato in userData/projects.json come
 * [{ path, openedAt }] dal più recente. Il nome mostrato è il nome della cartella.
 */
function createProjectsStore({ filePath }) {
  const read = () => {
    try {
      const list = JSON.parse(fs.readFileSync(filePath(), 'utf8'))
      return Array.isArray(list) ? list.filter((item) => item && typeof item.path === 'string') : []
    } catch { return [] }
  }

  function write(list) {
    fs.mkdirSync(path.dirname(filePath()), { recursive: true })
    fs.writeFileSync(filePath(), JSON.stringify(list.slice(0, MAX_PROJECTS), null, 2))
  }

  const same = samePath

  // Registra (o riporta in cima) un progetto appena aperto.
  function touch(project) {
    if (!project) return
    const list = read().filter((item) => !same(item.path, project))
    list.unshift({ path: path.resolve(project), openedAt: new Date().toISOString() })
    write(list)
  }

  function remove(project) {
    write(read().filter((item) => !same(item.path, project)))
  }

  // Il progetto è stato spostato: la voce cambia percorso e resta dov'è nell'elenco.
  function replace(from, to) {
    const list = read()
    const index = list.findIndex((item) => same(item.path, from))
    if (index === -1) return
    list[index] = { ...list[index], path: path.resolve(to) }
    write(list.filter((item, position) => position === index || !same(item.path, to)))
  }

  // `missing`: la cartella non esiste più (spostata o cancellata); resta nell'elenco finché non la si toglie.
  function list() {
    return read().map((item) => ({ path: item.path, name: path.basename(item.path) || item.path, openedAt: item.openedAt, missing: !fs.existsSync(item.path) }))
  }

  return { touch, remove, replace, list }
}

module.exports = { createProjectsStore }
