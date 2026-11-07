const { parentPort, workerData } = require('node:worker_threads')
const { createKnowledgeIndex } = require('./knowledge-index.cjs')
const { syncTree, syncPaths } = require('./knowledge-sync.cjs')
const { createThreadedEmbedder } = require('./semantic-embedder.cjs')

/**
 * Il thread che possiede l'indice di ricerca: la lettura dei file e l'indicizzazione non fermano mai l'interfaccia.
 * Riceve richieste { id, op, ... } e risponde { id, result } o { id, error } (vedi knowledge-service.cjs).
 */
const hidden = new Set(workerData.hiddenDirectories || [])
const index = createKnowledgeIndex({ file: workerData.file })

/**
 * Ricerca per significato (opzionale): se il modello è installato (semantic-pack.cjs) e un progetto l'ha attivata, i frammenti senza vettore si
 * trasformano in vettori in background, un gruppo alla volta, e la ricerca fonde le parole con il significato. Il modello è quello del dispositivo
 * scelto: 'cpu' (thread a parte, WebAssembly) oppure 'gpu' (finestra WebGPU nel processo principale, che qui si raggiunge per messaggi). I vettori
 * di ogni modello stanno a parte nell'indice. Qualsiasi guasto (modello assente o rotto, scheda che non risponde) si ferma a `semantic.error` e si
 * riferisce al processo principale, che può passare a un altro dispositivo: la ricerca per parole continua sempre a funzionare.
 */
const BATCH = { cpu: 8, gpu: 32 }
const SYNONYM_Z = 3.5 // quanto una parola deve staccarsi dalle altre per contare come sinonimo
const MAX_WORDS = 12000 // parole del vocabolario che si vettorizzano al massimo (le più frequenti)
const semantic = { device: null, model: '', directory: null, projects: [], embedder: null, running: false, again: false, error: null, generation: 0 }

// Il dispositivo GPU vive nel processo principale: le richieste partono come { call, op: 'gpu-embed' } e tornano come { call, result | error }.
const remote = new Map()
let remoteCalls = 0
function createRemoteEmbedder() {
  return {
    embed: (texts, kind) => new Promise((resolve, reject) => {
      remoteCalls += 1
      remote.set(remoteCalls, { resolve, reject })
      parentPort.postMessage({ call: remoteCalls, op: 'gpu-embed', texts, kind })
    }),
    async close() { parentPort.postMessage({ call: 0, op: 'gpu-release' }) },
  }
}

function ensureEmbedder() {
  if (semantic.embedder) return Promise.resolve(semantic.embedder)
  try {
    if (semantic.device === 'gpu') semantic.embedder = createRemoteEmbedder()
    else if (semantic.device === 'cpu' && semantic.directory) semantic.embedder = createThreadedEmbedder({ directory: semantic.directory })
    else return Promise.reject(new Error('The semantic search model is not installed'))
  } catch (error) { return Promise.reject(error) }
  return Promise.resolve(semantic.embedder)
}

async function dropEmbedder() {
  const embedder = semantic.embedder
  semantic.embedder = null
  if (embedder) await embedder.close()
}

function reportError(error) {
  semantic.error = String(error?.message || error)
  parentPort.postMessage({ event: 'semantic-error', device: semantic.device, model: semantic.model, error: semantic.error })
}

async function embedPending() {
  if (semantic.running) { semantic.again = true; return }
  if (!semantic.device || !semantic.projects.length) return
  semantic.running = true
  let failed = false
  try {
    do {
      semantic.again = false
      // `generation` cambia a ogni riconfigurazione (dispositivo, modello, pacchetto): un giro cominciato con la vecchia non vale più e ricomincia con la nuova.
      const generation = semantic.generation
      try {
        const embedder = await ensureEmbedder()
        // Il vocabolario (le parole dei testi) si vettorizza dopo i frammenti, un gruppo alla volta: serve ai sinonimi locali della Home.
        const wordsAfter = async () => {
          const size = (BATCH[semantic.device] || 8) * 4
          while (semantic.device && semantic.generation === generation && index.wordCount(semantic.model) < MAX_WORDS) {
            const model = semantic.model
            const words = index.pendingWords(model, size)
            if (!words.length) break
            const vectors = await embedder.embed(words, 'query')
            if (semantic.generation !== generation || semantic.model !== model) { semantic.again = true; break }
            index.storeWordVectors(model, words.map((word, position) => ({ word, vector: vectors[position] })))
          }
        }
        for (;;) {
          if (!semantic.device || !semantic.projects.length) break
          const model = semantic.model
          const batch = index.pendingEmbeddings(semantic.projects, model, BATCH[semantic.device] || 8)
          if (!batch.length) break
          const vectors = await embedder.embed(batch.map((item) => item.text), 'passage')
          // Se nel frattempo si è cambiato modello, questi vettori non appartengono più a quello attivo: si scartano (il ciclo riparte da capo).
          if (semantic.generation !== generation || semantic.model !== model) { semantic.again = true; break }
          index.storeEmbeddings(model, batch.map((item, position) => ({ hash: item.hash, vector: vectors[position] })))
        }
        if (semantic.device && semantic.projects.length && semantic.generation === generation) await wordsAfter()
      } catch (error) {
        // Il vecchio dispositivo chiuso sotto i piedi dalla riconfigurazione non è un guasto: si riparte con quello nuovo, senza toccarlo.
        if (semantic.generation !== generation) { semantic.again = true; continue }
        failed = true
        reportError(error)
        await dropEmbedder().catch(() => {})
        break
      }
    } while (semantic.again)
    if (!failed) {
      index.pruneEmbeddings()
      index.pruneWords()
      semantic.error = null
    }
  } finally {
    semantic.running = false
  }
}

// I thread del runtime vivono dentro questo thread: un loro errore non deve far cadere l'indice per parole.
process.on('uncaughtException', (error) => {
  if (!semantic.device) throw error
  reportError(error)
  dropEmbedder().catch(() => {})
})

const operations = {
  sync: ({ project }) => syncTree(index, project, '', hidden),
  paths: ({ project, paths }) => syncPaths(index, project, paths, hidden),
  search: async ({ project, query, options }) => {
    let queryVector = null
    if (options?.semantic && semantic.device) {
      try { [queryVector] = (await (await ensureEmbedder()).embed([query], 'query')) } catch (error) { reportError(error); await dropEmbedder().catch(() => {}) }
    }
    return index.search(project, query, { ...options, queryVector, model: semantic.model })
  },
  // Sinonimi dai testi: per ogni parola cercata, le parole del vocabolario più vicine per significato (senza quelle della stessa radice). Senza modello attivo, [].
  synonyms: async ({ words = [] }) => {
    const list = [...new Set(words.map((word) => String(word)))].slice(0, 8)
    if (!list.length || !semantic.device || !index.wordCount(semantic.model)) return []
    const model = semantic.model
    let vectors
    try { vectors = await (await ensureEmbedder()).embed(list, 'query') } catch (error) { reportError(error); await dropEmbedder().catch(() => {}); return [] }
    const sameRoot = (left, right) => { let k = 0; while (k < left.length && k < right.length && left[k] === right[k]) k += 1; return k >= Math.min(5, Math.min(left.length, right.length)) }
    return list.map((word, position) => ({
      word,
      near: index.nearestWords(model, vectors[position], { count: 8, exclude: list }).filter((item) => item.z >= SYNONYM_Z && !sameRoot(word, item.word)).slice(0, 3),
    }))
  },
  stats: ({ project }) => index.stats(project),
  centroids: ({ projects = [] }) => index.projectCentroids(projects, semantic.model),
  clear: ({ project }) => index.clearProject(project),
  rebuild: async ({ project }) => { index.clearProject(project); return syncTree(index, project, '', hidden) },
  // `device`: 'cpu', 'gpu' o null (spento); `model`: identificativo dei vettori; `directory`: il pacchetto CPU (la GPU non ne ha bisogno qui); `projects`: chiavi da
  // vettorizzare; `purge`: modelli di cui buttare i vettori (si è tolto il loro pacchetto).
  semantic: async ({ device = null, model = '', directory = null, projects = [], purge = [] }) => {
    const changed = semantic.device !== device || semantic.model !== model || semantic.directory !== directory
    if (changed || !device) { semantic.generation += 1; await dropEmbedder().catch(() => {}); semantic.error = null }
    semantic.device = device
    semantic.model = device ? model : ''
    semantic.directory = directory
    semantic.projects = device ? projects : []
    for (const id of purge) index.clearEmbeddings(id)
    return true
  },
  semanticStatus: ({ projects = [] }) => ({ ...index.embeddingStats(projects, semantic.model), running: semantic.running, error: semantic.error, active: Boolean(semantic.device), device: semantic.device, model: semantic.model }),
  close: async () => { await dropEmbedder().catch(() => {}); index.close(); return true },
}

// Le operazioni che leggono i file e scrivono nell'indice di un progetto (scansione, aggiornamento per percorsi, ricostruzione, svuotamento) hanno una coda per
// progetto: sono asincrone e, se si accavallassero, una scansione partita prima potrebbe togliere dall'indice (o rimetterci) ciò che un aggiornamento più
// recente ha appena sistemato. Progetti diversi restano indipendenti.
const MUTATES_FILES = new Set(['sync', 'paths', 'rebuild', 'clear'])
const queues = new Map()
function serialized(project, task) {
  const key = String(project ?? '').replace(/\\/g, '/').toLowerCase()
  const previous = queues.get(key) || Promise.resolve()
  const next = previous.catch(() => {}).then(task)
  const tail = next.catch(() => {})
  queues.set(key, tail)
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key) })
  return next
}

// Dopo ogni operazione che cambia i frammenti (o la configurazione) si riprende a calcolare i vettori mancanti.
const REFRESHES_EMBEDDINGS = new Set(['sync', 'paths', 'rebuild', 'semantic'])

parentPort.on('message', async (message) => {
  // Risposta del processo principale a una richiesta della GPU.
  if (message.call !== undefined) {
    const entry = remote.get(message.call)
    if (!entry) return
    remote.delete(message.call)
    if (message.error) entry.reject(new Error(message.error)); else entry.resolve(message.result)
    return
  }
  const { id, op, ...request } = message
  try {
    const run = operations[op]
    if (!run) throw new Error(`Unknown operation ${op}`)
    parentPort.postMessage({ id, result: await (MUTATES_FILES.has(op) ? serialized(request.project, () => run(request)) : run(request)) })
    if (REFRESHES_EMBEDDINGS.has(op)) embedPending()
  } catch (error) {
    parentPort.postMessage({ id, error: String(error?.message || error) })
  }
})
