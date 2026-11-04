const { parentPort, workerData } = require('node:worker_threads')
const { createKnowledgeIndex } = require('./knowledge-index.cjs')
const { syncTree, syncPaths } = require('./knowledge-sync.cjs')
const { createEmbedder } = require('./semantic-embedder.cjs')

/**
 * Il thread che possiede l'indice di ricerca: la lettura dei file e l'indicizzazione non fermano mai l'interfaccia.
 * Riceve richieste { id, op, ... } e risponde { id, result } o { id, error } (vedi knowledge-service.cjs).
 */
const hidden = new Set(workerData.hiddenDirectories || [])
const index = createKnowledgeIndex({ file: workerData.file })

/**
 * Ricerca per significato (opzionale): se il pacchetto semantico è installato (semantic-pack.cjs) e un progetto l'ha attivata, i frammenti senza
 * vettore si trasformano in vettori in background, un gruppo alla volta, e la ricerca fonde le parole con il significato. Qualsiasi guasto qui
 * (modello assente o rotto, memoria) si ferma a `semantic.error`: la ricerca per parole continua a funzionare.
 */
const EMBED_BATCH = 16
const semantic = { directory: null, projects: [], embedder: null, loading: null, running: false, again: false, error: null }

function ensureEmbedder() {
  if (semantic.embedder) return Promise.resolve(semantic.embedder)
  if (!semantic.directory) return Promise.reject(new Error('The semantic search pack is not installed'))
  semantic.loading = semantic.loading || createEmbedder({ directory: semantic.directory })
    .then((embedder) => { semantic.embedder = embedder; return embedder })
    .finally(() => { semantic.loading = null })
  return semantic.loading
}

async function dropEmbedder() {
  const embedder = semantic.embedder
  semantic.embedder = null
  if (embedder) await embedder.close()
}

async function embedPending() {
  if (semantic.running) { semantic.again = true; return }
  if (!semantic.directory || !semantic.projects.length) return
  semantic.running = true
  try {
    do {
      semantic.again = false
      const embedder = await ensureEmbedder()
      for (;;) {
        if (!semantic.directory || !semantic.projects.length) break
        const batch = index.pendingEmbeddings(semantic.projects, EMBED_BATCH)
        if (!batch.length) break
        const vectors = await embedder.embed(batch.map((item) => item.text), 'passage')
        index.storeEmbeddings(batch.map((item, position) => ({ hash: item.hash, vector: vectors[position] })))
      }
    } while (semantic.again)
    index.pruneEmbeddings()
    semantic.error = null
  } catch (error) {
    semantic.error = String(error?.message || error)
    await dropEmbedder().catch(() => {})
  } finally {
    semantic.running = false
  }
}

// I thread del runtime WebAssembly vivono dentro questo: un loro errore non deve far cadere l'indice per parole.
process.on('uncaughtException', (error) => {
  if (!semantic.directory) throw error
  semantic.error = String(error?.message || error)
  dropEmbedder().catch(() => {})
})

const operations = {
  sync: ({ project }) => syncTree(index, project, '', hidden),
  paths: ({ project, paths }) => syncPaths(index, project, paths, hidden),
  search: async ({ project, query, options }) => {
    let queryVector = null
    if (options?.semantic && semantic.directory) {
      try { [queryVector] = (await (await ensureEmbedder()).embed([query], 'query')) } catch (error) { semantic.error = String(error?.message || error) }
    }
    return index.search(project, query, { ...options, queryVector })
  },
  stats: ({ project }) => index.stats(project),
  clear: ({ project }) => index.clearProject(project),
  rebuild: async ({ project }) => { index.clearProject(project); return syncTree(index, project, '', hidden) },
  // `directory`: il pacchetto pronto (o null); `projects`: chiavi dei progetti da vettorizzare; `model`: identifica il modello dei vettori; `purge`: butta i vettori.
  semantic: async ({ directory = null, projects = [], model = '', purge = false }) => {
    semantic.directory = directory
    semantic.projects = directory ? projects : []
    if (!directory) { await dropEmbedder(); semantic.error = null }
    if (purge) index.clearEmbeddings()
    else if (directory) index.useEmbeddingModel(model)
    return true
  },
  semanticStatus: ({ projects = [] }) => ({ ...index.embeddingStats(projects), running: semantic.running || Boolean(semantic.loading), error: semantic.error, active: Boolean(semantic.directory) }),
  close: async () => { await dropEmbedder().catch(() => {}); index.close(); return true },
}

// Dopo ogni operazione che cambia i frammenti (o la configurazione) si riprende a calcolare i vettori mancanti.
const REFRESHES_EMBEDDINGS = new Set(['sync', 'paths', 'rebuild', 'semantic'])

parentPort.on('message', async ({ id, op, ...request }) => {
  try {
    const run = operations[op]
    if (!run) throw new Error(`Unknown operation ${op}`)
    parentPort.postMessage({ id, result: await run(request) })
    if (REFRESHES_EMBEDDINGS.has(op)) embedPending()
  } catch (error) {
    parentPort.postMessage({ id, error: String(error?.message || error) })
  }
})
