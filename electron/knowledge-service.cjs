const path = require('node:path')

/**
 * Lato processo principale dell'indice di ricerca: avvia il worker (knowledge-worker.cjs) e gli manda le richieste.
 * L'indice è un di più: se il worker non parte o cade, `available` diventa falso e l'app funziona come prima (resta `search_files`).
 */
// Su Windows i percorsi non distinguono maiuscole e minuscole: la stessa cartella deve dare sempre la stessa chiave.
const projectKey = (project) => (process.platform === 'win32' ? path.resolve(project).toLowerCase() : path.resolve(project))

// `gpuEmbed(texts, kind)` / `gpuRelease()`: il dispositivo GPU sta nel processo principale (WebGPU esiste solo in Chromium, vedi gpu-context.cjs) e il worker lo
// raggiunge per messaggi. `onSemanticError({ device, model, error })`: il worker riferisce un guasto del calcolo dei vettori (chi gestisce può cambiare dispositivo).
function createKnowledgeService({ file, hiddenDirectories = [], createWorker, debounceMs = 800, gpuEmbed = null, gpuRelease = null, onSemanticError = null }) {
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
      worker.on('message', (message) => {
        if (message.event === 'semantic-error') { try { onSemanticError?.(message) } catch { /* chi ascolta non deve fermare l'indice */ } return }
        if (message.call !== undefined) { answerGpu(message); return }
        const { id, result, error } = message
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

  // Una richiesta del worker per la GPU: si esegue qui e si risponde con { call, result | error }.
  async function answerGpu({ call, op, texts, kind }) {
    if (op === 'gpu-release') { try { await gpuRelease?.() } catch { /* già libera */ } return }
    try {
      if (!gpuEmbed) throw new Error('The GPU is not available')
      const vectors = await gpuEmbed(texts, kind)
      worker?.postMessage({ call, result: vectors }, vectors.map((vector) => vector.buffer))
    } catch (error) {
      worker?.postMessage({ call, error: String(error?.message || error) })
    }
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
    // Vettore medio (normalizzato) dei frammenti di ogni progetto, col modello attivo: { [chiave]: { count, vector } }.
    centroids: (projects) => request('centroids', { projects: projects.map(projectKey) }),
    // Ricerca per significato: `device` ('cpu', 'gpu' o null = spenta), `model` l'id dei vettori, `directory` il pacchetto CPU, `projects` i progetti (e riferimenti)
    // da vettorizzare, `purge` i modelli di cui buttare i vettori.
    semanticConfigure: ({ device = null, model = '', directory = null, projects = [], purge = [] }) => request('semantic', { device, model, directory, projects: projects.map(projectKey), purge }),
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
// Le parole della ricerca, evidenziate con « » nel percorso dei titoli (lo snippet le evidenzia già nel testo): un passaggio può rispondere perché il titolo contiene la parola.
// Senza accenti e maiuscole, come la ricerca; una parola che comincia con quella cercata si evidenzia tutta (l'ultima parola cercata vale anche come prefisso).
function markTerms(text, query) {
  const fold = (value) => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
  const terms = [...new Set((String(query).match(/[\p{L}\p{N}]+/gu) || []).map(fold).filter((term) => term.length >= 2))].slice(0, 12)
  if (!terms.length) return text
  return text.replace(/[\p{L}\p{N}]+/gu, (word) => (terms.some((term) => fold(word).startsWith(term)) ? `«${word}»` : word))
}

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
    lines.push(`${position + 1}. ${entry.path}:${entry.startLine}-${entry.endLine}${entry.heading ? ` — ${markTerms(entry.heading, query)}` : ''}`)
    lines.push(`   ${entry.snippet.replace(/\s+/g, ' ').trim()}`)
  })
  lines.push('', `The passages come from an index that can be a few seconds behind the files: read the lines with ${readTool} (startLine/endLine) before quoting or editing them. The words between « » are the matches (a passage chosen by meaning may have none).`)
  return lines.join('\n')
}

module.exports = { createKnowledgeService, projectKey, formatKnowledgeResults, markTerms }
