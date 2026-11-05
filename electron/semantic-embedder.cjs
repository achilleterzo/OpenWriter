const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

/**
 * Trasforma un testo in un vettore che ne rappresenta il significato (embedding), con il modello del pacchetto semantico (semantic-pack.cjs):
 * multilingual-e5-small, 384 numeri per testo. Gira nel thread dell'indice, in WebAssembly (onnxruntime-web): il calcolo avviene nei thread del
 * runtime e il thread dell'indice resta libero tra un gruppo di testi e l'altro.
 *
 * E5 vuole un prefisso: "passage: " per ciò che si indicizza, "query: " per ciò che si cerca. I vettori escono già normalizzati (lunghezza 1), così
 * la somiglianza tra due testi è il loro prodotto scalare.
 */
const MAX_TOKENS = 512
const PAD_ID = 1n // <pad> di XLM-R: sotto la maschera di attenzione non conta, ma è quello che il modello si aspetta
const PREFIX = { query: 'query: ', passage: 'passage: ' }
const DIMENSIONS = 384

async function createEmbedder({ directory, threads = Math.max(1, Math.min(4, Math.floor(os.cpus().length / 2))) }) {
  const file = (name) => path.join(directory, name)
  const ort = await import(pathToFileURL(file('ort.node.min.mjs')).href)
  // In Node `fetch` non legge file://: il WebAssembly si passa già in memoria, e solo il modulo di avvio dei thread si indica per URL.
  ort.env.wasm.wasmBinary = fs.readFileSync(file('ort-wasm-simd-threaded.wasm'))
  ort.env.wasm.wasmPaths = { mjs: pathToFileURL(file('ort-wasm-simd-threaded.mjs')).href }
  ort.env.wasm.numThreads = threads
  ort.env.logLevel = 'error'
  const { Tokenizer } = await import('@huggingface/tokenizers')
  const tokenizer = new Tokenizer(JSON.parse(fs.readFileSync(file('tokenizer.json'), 'utf8')), JSON.parse(fs.readFileSync(file('tokenizer_config.json'), 'utf8')))
  const session = await ort.InferenceSession.create(fs.readFileSync(file('model.onnx')), { executionProviders: ['wasm'] })

  // `kind`: 'passage' (da indicizzare) o 'query' (da cercare). → un Float32Array normalizzato per testo.
  async function embed(texts, kind = 'passage') {
    if (!texts.length) return []
    const prefix = PREFIX[kind] || PREFIX.passage
    const encoded = texts.map((text) => {
      const ids = tokenizer.encode(prefix + text).ids
      // Oltre il limite del modello si taglia, tenendo il simbolo di fine.
      return ids.length > MAX_TOKENS ? [...ids.slice(0, MAX_TOKENS - 1), ids[ids.length - 1]] : ids
    })
    const length = Math.max(...encoded.map((ids) => ids.length))
    const inputIds = new BigInt64Array(texts.length * length).fill(PAD_ID)
    const mask = new BigInt64Array(texts.length * length)
    encoded.forEach((ids, row) => ids.forEach((id, column) => { inputIds[row * length + column] = BigInt(id); mask[row * length + column] = 1n }))
    const shape = [texts.length, length]
    const output = await session.run({
      input_ids: new ort.Tensor('int64', inputIds, shape),
      attention_mask: new ort.Tensor('int64', mask, shape),
      token_type_ids: new ort.Tensor('int64', new BigInt64Array(texts.length * length), shape),
    })
    const hidden = output[session.outputNames[0]]
    const dimensions = hidden.dims[2]
    // Media dei vettori dei simboli (solo quelli veri), poi normalizzazione.
    return texts.map((_, row) => {
      const vector = new Float32Array(dimensions)
      let count = 0
      for (let column = 0; column < length; column += 1) {
        if (!mask[row * length + column]) continue
        count += 1
        const base = (row * length + column) * dimensions
        for (let k = 0; k < dimensions; k += 1) vector[k] += hidden.data[base + k]
      }
      let norm = 0
      for (let k = 0; k < dimensions; k += 1) { vector[k] /= count || 1; norm += vector[k] * vector[k] }
      norm = Math.sqrt(norm) || 1
      for (let k = 0; k < dimensions; k += 1) vector[k] /= norm
      return vector
    })
  }

  return {
    dimensions: DIMENSIONS,
    embed,
    async close() { try { await session.release() } catch { /* già rilasciata */ } },
  }
}

/**
 * Lo stesso embedder, ma in un thread suo (semantic-embedder-worker.cjs): chi lo usa (il thread dell'indice) non si blocca mai mentre il modello
 * calcola. Stessa interfaccia di createEmbedder; se il thread cade, le richieste in corso falliscono e `embed` rifiuta da lì in poi.
 */
function createThreadedEmbedder({ directory }) {
  const { Worker } = require('node:worker_threads')
  const worker = new Worker(path.join(__dirname, 'semantic-embedder-worker.cjs'), { workerData: { directory } })
  const pending = new Map()
  let nextId = 1
  let failure = null
  const fail = (error) => {
    failure = failure || new Error(String(error?.message || error))
    for (const entry of pending.values()) entry.reject(failure)
    pending.clear()
  }
  worker.on('message', ({ id, vectors, error, closed }) => {
    if (!id) { if (error) fail(error); return }
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    if (error) entry.reject(new Error(error)); else entry.resolve(closed ? true : vectors.map((buffer) => new Float32Array(buffer.buffer ? buffer.buffer : buffer)))
  })
  worker.on('error', fail)
  worker.on('exit', (code) => fail(new Error(`The embedding thread stopped (code ${code})`)))
  worker.unref?.()
  const request = (message) => (failure ? Promise.reject(failure) : new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    worker.postMessage({ id, ...message })
  }))
  return {
    dimensions: DIMENSIONS,
    embed: (texts, kind = 'passage') => (texts.length ? request({ op: 'embed', texts, kind }) : Promise.resolve([])),
    async close() {
      try { if (!failure) await request({ op: 'close' }) } catch { /* già caduto */ }
      await worker.terminate().catch(() => {})
    },
  }
}

module.exports = { createEmbedder, createThreadedEmbedder, DIMENSIONS }
