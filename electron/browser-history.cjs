const fs = require('node:fs')
const path = require('node:path')
const { writeFileAtomic } = require('./atomic-write.cjs')

const MAX_ENTRIES = 500

/**
 * Cronologia degli indirizzi visitati nel browser integrato, per progetto: `.ow/browser-history.json`
 *   [ { url, title, visitedAt } ]   (la più recente per prima, una sola voce per indirizzo)
 * Ce ne sono due: quella dell'utente (`browser-history.json`) e quella dell'assistente (`browser-history-agent.json`), tenute separate.
 * Solo indirizzi http(s), senza il frammento (#…): è la pagina, non la posizione nella pagina.
 */
function createBrowserHistory({ getProjectPath, fileName = 'browser-history.json' }) {
  const file = () => path.join(path.resolve(getProjectPath()), '.ow', fileName)

  function read() {
    try {
      const list = JSON.parse(fs.readFileSync(file(), 'utf8'))
      return Array.isArray(list) ? list.filter((entry) => entry && typeof entry.url === 'string') : []
    } catch { return [] }
  }

  function write(list) {
    fs.mkdirSync(path.dirname(file()), { recursive: true })
    writeFileAtomic(file(), JSON.stringify(list.slice(0, MAX_ENTRIES), null, 2))
  }

  function cleanUrl(value) {
    try {
      const url = new URL(String(value))
      if (!/^https?:$/.test(url.protocol)) return null
      url.hash = ''
      const text = url.toString()
      return text.length <= 2000 ? text : null
    } catch { return null }
  }

  return {
    list: () => read(),
    add({ url, title } = {}) {
      const clean = cleanUrl(url)
      if (!clean) return read()
      const list = read()
      const previous = list.find((entry) => entry.url === clean)
      const next = { url: clean, title: String(title || previous?.title || '').trim().slice(0, 200), visitedAt: new Date().toISOString() }
      const updated = [next, ...list.filter((entry) => entry.url !== clean)]
      write(updated)
      return updated.slice(0, MAX_ENTRIES)
    },
    remove(url) {
      const updated = read().filter((entry) => entry.url !== String(url))
      write(updated)
      return updated
    },
    clear() {
      write([])
      return []
    },
  }
}

module.exports = { createBrowserHistory }
