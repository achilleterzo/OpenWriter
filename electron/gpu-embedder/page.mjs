// La pagina del contesto WebGPU (vedi gpu-context.cjs): dentro una finestra nascosta di Chromium calcola i vettori del modello sulla scheda video con
// onnxruntime-web (backend WebGPU). Fa le stesse cose di semantic-embedder.cjs (prefisso E5, tokenizzatore, media sui simboli veri, normalizzazione),
// ma con il modello fp16 del pacchetto GPU. Le richieste arrivano dal processo principale tramite il ponte del preload.
import { Tokenizer } from './vendor/tokenizers.mjs'

const MAX_TOKENS = 512
// Come in semantic-embedder.cjs: il testo si taglia prima di tokenizzarlo (un passaggio enorme farebbe traboccare lo stack: «Maximum call stack size exceeded»).
const MAX_CHARS = 4000
const PAD_ID = 1n
const PREFIX = { query: 'query: ', passage: 'passage: ' }
const bridge = window.owEmbedder

let loading = null
let ort = null
let tokenizer = null
let session = null

const fetchPack = async (name, kind) => {
  const response = await fetch(`./pack/${name}`)
  if (!response.ok) throw new Error(`${name}: ${response.status}`)
  return kind === 'json' ? response.json() : response.arrayBuffer()
}

// `power`: 'high-performance' (la scheda dedicata), 'low-power' (quella integrata) o 'auto' (sceglie il sistema).
const powerOptions = (power) => (power === 'high-performance' || power === 'low-power' ? { powerPreference: power } : undefined)

async function adapterInfo(power) {
  if (!navigator.gpu) return { webgpu: false, reason: 'WebGPU is not available in this system' }
  const adapter = await navigator.gpu.requestAdapter(powerOptions(power))
  if (!adapter) return { webgpu: false, reason: 'No graphics adapter supports WebGPU' }
  const info = adapter.info || {}
  return { webgpu: true, vendor: info.vendor || '', architecture: info.architecture || '', device: info.device || '', description: info.description || '', fp16: adapter.features.has('shader-f16') }
}

// WebGPU non elenca le schede: ne dà una per ogni preferenza. Chiedendole entrambe (dedicata e integrata) e togliendo i doppioni si ottengono le schede
// che si possono scegliere; con una sola scheda l'elenco ha un solo elemento.
async function listAdapters() {
  const found = []
  const keyOf = (info) => [info.vendor, info.architecture, info.device, info.description].join('|')
  // La scheda che il sistema sceglie senza preferenze: è quella «predefinita».
  let defaultKey = null
  try { const info = await adapterInfo('auto'); if (info.webgpu) defaultKey = keyOf(info) } catch { /* nessuna */ }
  for (const power of ['high-performance', 'low-power']) {
    try {
      const info = await adapterInfo(power)
      if (!info.webgpu) continue
      const key = keyOf(info)
      if (!found.some((item) => item.key === key)) found.push({ key, power, vendor: info.vendor, architecture: info.architecture, device: info.device, description: info.description })
    } catch { /* quella preferenza non dà una scheda */ }
  }
  return found.map(({ key, ...adapter }) => ({ ...adapter, isDefault: key === defaultKey }))
}

function load(power) {
  if (!loading) {
    loading = (async () => {
      const info = await adapterInfo(power)
      if (!info.webgpu) throw new Error(info.reason)
      ort = await import('./pack/ort.webgpu.bundle.min.mjs')
      // Una sola thread per il WebAssembly (senza isolamento cross-origin non esistono thread condivisi): il lavoro lo fa la GPU.
      ort.env.wasm.numThreads = 1
      // Dalla 1.31 il backend WebGPU usa la variante «asyncify» del modulo WebAssembly (non la vecchia «jsep»).
      ort.env.wasm.wasmPaths = { mjs: new URL('./pack/ort-wasm-simd-threaded.asyncify.mjs', import.meta.url).href, wasm: new URL('./pack/ort-wasm-simd-threaded.asyncify.wasm', import.meta.url).href }
      ort.env.logLevel = 'error'
      // onnxruntime sceglie la scheda da sé: gli si dice quale preferire (come nel probe).
      if (powerOptions(power)) ort.env.webgpu.powerPreference = power
      tokenizer = new Tokenizer(await fetchPack('tokenizer.json', 'json'), await fetchPack('tokenizer_config.json', 'json'))
      session = await ort.InferenceSession.create(new Uint8Array(await fetchPack('model.onnx')), { executionProviders: ['webgpu'] })
    })().catch((error) => { loading = null; throw error })
  }
  return loading
}

// float16 (Uint16Array) → float32
function halfToFloat(half) {
  const sign = (half & 0x8000) ? -1 : 1
  const exponent = (half >> 10) & 0x1f
  const fraction = half & 0x3ff
  if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024)
  if (exponent === 0x1f) return fraction ? NaN : sign * Infinity
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024)
}

async function embed(texts, kind, power) {
  await load(power)
  const prefix = PREFIX[kind] || PREFIX.passage
  const encoded = texts.map((text) => {
    const ids = tokenizer.encode(prefix + String(text).slice(0, MAX_CHARS)).ids
    return ids.length > MAX_TOKENS ? [...ids.slice(0, MAX_TOKENS - 1), ids[ids.length - 1]] : ids
  })
  const length = Math.max(...encoded.map((ids) => ids.length))
  const inputIds = new BigInt64Array(texts.length * length).fill(PAD_ID)
  const mask = new BigInt64Array(texts.length * length)
  encoded.forEach((ids, row) => ids.forEach((id, column) => { inputIds[row * length + column] = BigInt(id); mask[row * length + column] = 1n }))
  const shape = [texts.length, length]
  const feeds = {
    input_ids: new ort.Tensor('int64', inputIds, shape),
    attention_mask: new ort.Tensor('int64', mask, shape),
    token_type_ids: new ort.Tensor('int64', new BigInt64Array(texts.length * length), shape),
  }
  const output = await session.run(feeds)
  const hidden = output[session.outputNames[0]]
  let data = await hidden.getData()
  if (data instanceof Uint16Array) data = Float32Array.from(data, halfToFloat)
  const dimensions = hidden.dims[2]
  const vectors = texts.map((_, row) => {
    const vector = new Float32Array(dimensions)
    let count = 0
    for (let column = 0; column < length; column += 1) {
      if (!mask[row * length + column]) continue
      count += 1
      const base = (row * length + column) * dimensions
      for (let k = 0; k < dimensions; k += 1) vector[k] += data[base + k]
    }
    let norm = 0
    for (let k = 0; k < dimensions; k += 1) { vector[k] /= count || 1; norm += vector[k] * vector[k] }
    norm = Math.sqrt(norm) || 1
    for (let k = 0; k < dimensions; k += 1) vector[k] /= norm
    return vector
  })
  for (const tensor of Object.values(feeds)) tensor.dispose?.()
  hidden.dispose?.()
  return vectors
}

// Una richiesta alla volta: il runtime lavora una sola sessione.
let queue = Promise.resolve()
bridge.onRequest(({ id, op, texts, kind, power }) => {
  queue = queue.then(async () => {
    try {
      if (op === 'probe') {
        const info = await adapterInfo(power)
        bridge.reply(id, { info: info.webgpu ? { ...info, adapters: await listAdapters() } : info })
      }
      else if (op === 'embed') bridge.reply(id, { vectors: await embed(texts, kind, power) })
      else if (op === 'load') { await load(power); bridge.reply(id, { loaded: true }) }
      else if (op === 'release') { session = null; loading = null; bridge.reply(id, { released: true }) }
      else bridge.reply(id, { error: `Unknown operation ${op}` })
    } catch (error) {
      bridge.reply(id, { error: String(error?.message || error) })
    }
  })
})

bridge.reply(0, { ready: true })
