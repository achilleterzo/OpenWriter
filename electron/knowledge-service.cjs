const path = require('node:path')

/**
 * Lato processo principale dell'indice di ricerca: avvia il worker (knowledge-worker.cjs) e gli manda le richieste.
 * L'indice è un di più: se il worker non parte o cade, `available` diventa falso e l'app funziona come prima (resta `search_files`).
 */
// Su Windows i percorsi non distinguono maiuscole e minuscole: la stessa cartella deve dare sempre la stessa chiave.
const projectKey = (project) => (process.platform === 'win32' ? path.resolve(project).toLowerCase() : path.resolve(project))

function createKnowledgeService({ file, hiddenDirectories = [], createWorker, debounceMs = 800 }) {
  let worker = null
  let failure = null
  let nextId = 1
  const pending = new Map()
  const queued = new Map() // chiave progetto → { project, paths: Set | null (null = riscansione completa) }
  let timer = null
  let busy = 0 // scansioni e aggiornamenti dell'indice in corso (per la barra di avanzamento)

  function fail(error) {
    failure = failure || String(error?.message || error)
    for (const { reject } of pending.values()) reject(new Error(failure))
    pending.clear()
    worker = null
  }

  function start() {
    if (worker || failure) return worker
    try {
      worker = createWorker({ file, hiddenDirectories: [...hiddenDirectories] })
      worker.on('message', ({ id, result, error }) => {
        const entry = pending.get(id)
        if (!entry) return
        pending.delete(id)
        if (error) entry.reject(new Error(error)); else entry.resolve(result)
      })
      worker.on('error', fail)
      worker.on('exit', (code) => { if (worker) fail(new Error(`The search index stopped (code ${code})`)) })
      worker.unref?.()
    } catch (error) { fail(error) }
    return worker
  }

  function request(op, data = {}) {
    if (!start()) return Promise.reject(new Error(failure || 'The search index is not available'))
    const result = new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      worker.postMessage({ id, op, ...data })
    })
    if (op === 'sync' || op === 'paths' || op === 'rebuild') {
      busy += 1
      const done = () => { busy -= 1 }
      result.then(done, done)
    }
    return result
  }

  function flush() {
    timer = null
    const batches = [...queued.values()]
    queued.clear()
    for (const { project, paths } of batches) {
      const job = paths ? request('paths', { project, paths: [...paths] }) : request('sync', { project })
      job.catch(() => { /* l'indice si riallinea alla prossima scansione */ })
    }
  }

  return {
    get available() { return !failure },
    get error() { return failure },
    // Ci sono scansioni o aggiornamenti dei file in corso (o in attesa del loro turno).
    get syncing() { return busy > 0 || queued.size > 0 },
    // Scansione completa: all'apertura del progetto e dopo un cambiamento di cui non si conoscono i file.
    sync: (project) => request('sync', { project: projectKey(project) }),
    // File cambiati, creati, rinominati o eliminati (relativi alla radice del progetto): si raccolgono e si aggiornano insieme.
    changed(project, relatives) {
      if (failure || !project) return
      const key = projectKey(project)
      const entry = queued.get(key) || { project: key, paths: new Set() }
      if (!relatives) entry.paths = null
      else if (entry.paths) for (const relative of relatives) entry.paths.add(String(relative).split(path.sep).join('/'))
      queued.set(key, entry)
      clearTimeout(timer)
      timer = setTimeout(flush, debounceMs)
    },
    // `project`: un progetto o un elenco (il progetto e le cartelle di riferimento): ogni risultato porta `project`, la chiave di quello da cui viene.
    search: (project, query, options) => request('search', { project: Array.isArray(project) ? project.map(projectKey) : projectKey(project), query, options }),
    stats: (project) => request('stats', { project: projectKey(project) }),
    // Ricerca per significato: `directory` è il pacchetto pronto (null = non disponibile), `projects` i progetti (e riferimenti) da vettorizzare, `model` l'id del modello.
    semanticConfigure: ({ directory = null, projects = [], model = '', purge = false }) => request('semantic', { directory, projects: projects.map(projectKey), model, purge }),
    semanticStatus: (projects) => request('semanticStatus', { projects: projects.map(projectKey) }),
    rebuild: (project) => request('rebuild', { project: projectKey(project) }),
    clear: (project) => request('clear', { project: projectKey(project) }),
    key: projectKey,
    async close() {
      clearTimeout(timer)
      if (!worker) return
      try { await request('close') } catch { /* già chiuso */ }
      const current = worker
      worker = null
      try { await current.terminate() } catch { /* già terminato */ }
    },
  }
}

// Il testo che legge un assistente: un blocco per passaggio, con file e righe da aprire con read_file (startLine/endLine).
function formatKnowledgeResults(query, { mode, results }, { files = 0 } = {}, readTool = 'read_file') {
  if (!files) return 'The search index of this project is empty or still being built: use search_files to look in the files.'
  if (!results.length) return `Nothing found for “${query}” in ${files} indexed documents. Try other words, synonyms or the singular form, or use search_files for an exact text or a regular expression.`
  const lines = [
    mode === 'or'
      ? `No passage contains all the words of “${query}”. These contain at least one of them, best first:`
      : mode === 'hybrid'
        ? `${results.length} passage${results.length === 1 ? '' : 's'} for “${query}”, best first (by words and by meaning, so a passage can fit without containing the words):`
        : `${results.length} passage${results.length === 1 ? '' : 's'} for “${query}”, best first:`,
    '',
  ]
  results.forEach((entry, position) => {
    lines.push(`${position + 1}. ${entry.path}:${entry.startLine}-${entry.endLine}${entry.heading ? ` — ${entry.heading}` : ''}`)
    lines.push(`   ${entry.snippet.replace(/\s+/g, ' ').trim()}`)
  })
  lines.push('', `The passages come from an index that can be a few seconds behind the files: read the lines with ${readTool} (startLine/endLine) before quoting or editing them. The words between « » are the matches (a passage chosen by meaning may have none).`)
  return lines.join('\n')
}

module.exports = { createKnowledgeService, projectKey, formatKnowledgeResults }
