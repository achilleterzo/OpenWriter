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
const semantic = { device: null, model: '', directory: null, projects: [], embedder: null, running: false, again: false, error: null }

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
  try {
    do {
      semantic.again = false
      const embedder = await ensureEmbedder()
      for (;;) {
        if (!semantic.device || !semantic.projects.length) break
        const model = semantic.model
        const batch = index.pendingEmbeddings(semantic.projects, model, BATCH[semantic.device] || 8)
        if (!batch.length) break
        const vectors = await embedder.embed(batch.map((item) => item.text), 'passage')
        // Se nel frattempo si è cambiato modello, questi vettori non appartengono più a quello attivo: si scartano (il ciclo riparte da capo).
        if (semantic.model !== model) { semantic.again = true; break }
        index.storeEmbeddings(model, batch.map((item, position) => ({ hash: item.hash, vector: vectors[position] })))
      }
    } while (semantic.again)
    index.pruneEmbeddings()
    semantic.error = null
  } catch (error) {
    reportError(error)
    await dropEmbedder().catch(() => {})
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
  stats: ({ project }) => index.stats(project),
  centroids: ({ projects = [] }) => index.projectCentroids(projects, semantic.model),
  clear: ({ project }) => index.clearProject(project),
  rebuild: async ({ project }) => { index.clearProject(project); return syncTree(index, project, '', hidden) },
  // `device`: 'cpu', 'gpu' o null (spento); `model`: identificativo dei vettori; `directory`: il pacchetto CPU (la GPU non ne ha bisogno qui); `projects`: chiavi da
  // vettorizzare; `purge`: modelli di cui buttare i vettori (si è tolto il loro pacchetto).
  semantic: async ({ device = null, model = '', directory = null, projects = [], purge = [] }) => {
    const changed = semantic.device !== device || semantic.model !== model || semantic.directory !== directory
    if (changed || !device) { await dropEmbedder().catch(() => {}); semantic.error = null }
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
    parentPort.postMessage({ id, result: await run(request) })
    if (REFRESHES_EMBEDDINGS.has(op)) embedPending()
  } catch (error) {
    parentPort.postMessage({ id, error: String(error?.message || error) })
  }
})
