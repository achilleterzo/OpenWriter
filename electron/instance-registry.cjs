const fs = require('node:fs')
const path = require('node:path')
const { isAlive } = require('./primary-instance.cjs')

/**
 * Quale progetto ha aperto ogni finestra (ogni istanza dell'app): un file `<pid>.json` per istanza nella cartella `instances` dei dati dell'app.
 * Serve a non far lavorare due finestre sullo stesso progetto (sessione, cronologia e indice si pesterebbero) e, se succede, a portare in primo piano la finestra
 * che lo ha già: chi chiede scrive `<pid>.focus`, e quella istanza, che controlla a intervalli, si porta avanti.
 * I file delle istanze morte (pid inesistente) si ignorano e si tolgono.
 */
function createInstanceRegistry({ directory, samePath, pid = process.pid, alive = isAlive }) {
  const own = () => path.join(directory, `${pid}.json`)
  const focusFile = (target) => path.join(directory, `${target}.focus`)

  // Le altre istanze vive: [{ pid, project }].
  function others() {
    let names = []
    try { names = fs.readdirSync(directory) } catch { return [] }
    const result = []
    for (const name of names) {
      const match = /^(\d+)\.json$/.exec(name)
      if (!match) continue
      const other = Number(match[1])
      if (other === pid) continue
      if (!alive(other)) {
        try { fs.rmSync(path.join(directory, name), { force: true }); fs.rmSync(focusFile(other), { force: true }) } catch { /* già tolto */ }
        continue
      }
      try {
        const entry = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'))
        result.push({ pid: other, project: typeof entry.project === 'string' ? entry.project : null })
      } catch { /* in scrittura o illeggibile: per ora non conta */ }
    }
    return result
  }

  // Il progetto di questa istanza (null = nessuno).
  function register(project) {
    try {
      fs.mkdirSync(directory, { recursive: true })
      fs.writeFileSync(own(), JSON.stringify({ pid, project: project || null }))
    } catch (error) { console.error('Istanza non registrata:', error.message) }
  }

  const holder = (project) => (project ? others().find((entry) => entry.project && samePath(entry.project, project)) || null : null)

  function requestFocus(target) {
    try { fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(focusFile(target), String(Date.now())) } catch { /* senza richiesta la finestra resta dov'è */ }
  }

  // `onFocus()` quando un'altra istanza chiede di portare questa finestra in primo piano.
  function watchFocus(onFocus, intervalMs = 800) {
    const timer = setInterval(() => {
      const file = focusFile(pid)
      if (!fs.existsSync(file)) return
      try { fs.rmSync(file, { force: true }) } catch { /* già tolto */ }
      try { onFocus() } catch (error) { console.error(error) }
    }, intervalMs)
    timer.unref?.()
    return () => clearInterval(timer)
  }

  function unregister() {
    try { fs.rmSync(own(), { force: true }); fs.rmSync(focusFile(pid), { force: true }) } catch { /* già tolto */ }
  }

  return { others, register, holder, requestFocus, watchFocus, unregister }
}

module.exports = { createInstanceRegistry }
