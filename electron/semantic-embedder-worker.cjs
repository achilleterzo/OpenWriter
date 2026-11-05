const { parentPort, workerData } = require('node:worker_threads')
const { createEmbedder } = require('./semantic-embedder.cjs')

/**
 * Il thread che calcola i vettori (vedi createThreadedEmbedder in semantic-embedder.cjs). Il runtime WebAssembly esegue l'inferenza nel thread che
 * lo chiama: se fosse il thread dell'indice, ricerca, stato e aggiornamenti resterebbero fermi per tutto il tempo del calcolo. Qui può bloccarsi
 * quanto vuole. Richieste { id, op: 'embed' | 'close', texts, kind } → { id, vectors } oppure { id, error }.
 */
let embedder = null
const ready = createEmbedder({ directory: workerData.directory }).then((value) => { embedder = value })
ready.catch(() => { /* l'errore arriva con la prima richiesta */ })

parentPort.on('message', async ({ id, op, texts, kind }) => {
  try {
    await ready
    if (op === 'close') { await embedder.close(); parentPort.postMessage({ id, closed: true }); return }
    const vectors = await embedder.embed(texts, kind)
    parentPort.postMessage({ id, vectors }, vectors.map((vector) => vector.buffer))
  } catch (error) {
    parentPort.postMessage({ id, error: String(error?.message || error) })
  }
})

// Un errore dai thread del runtime non deve far cadere il processo in silenzio: lo si riferisce a chi aspetta.
process.on('uncaughtException', (error) => parentPort.postMessage({ id: 0, error: String(error?.message || error) }))
