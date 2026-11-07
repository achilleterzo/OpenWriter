const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

/**
 * Il "pacchetto semantico": ciò che serve alla ricerca per significato e che NON viaggia con l'app, perché pesa (circa 135 MB). Si scarica solo
 * quando l'utente lo chiede, finisce in una cartella dei dati dell'app (mai nel progetto) e si può togliere in qualsiasi momento. Senza, tutto
 * funziona come prima: la ricerca per parole (FTS5) non ne dipende.
 *
 *  - il modello di embedding multilingue (multilingual-e5-small, quantizzato a 8 bit) con il suo tokenizzatore, da Hugging Face;
 *  - il runtime ONNX in WebAssembly (onnxruntime-web, build per Node): gli stessi tre file su ogni sistema, senza librerie native per piattaforma.
 *
 * Versioni fissate e controllo SHA-256: un file diverso da quello atteso (rete che lo altera, CDN che cambia) si scarta. Il file `ready.json`
 * si scrive per ultimo: se manca, il pacchetto non è pronto e si riparte (i file già verificati non si riscaricano).
 */
const MODEL_REVISION = '761b726dd34fb83930e26aab4e9ac3899aa1fa78'
const ORT_VERSION = '1.31.1'
const PACK_ID = 'multilingual-e5-small-q8'
const hub = (file) => `https://huggingface.co/Xenova/multilingual-e5-small/resolve/${MODEL_REVISION}/${file}`
const cdn = (file) => `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/${file}`

const FILES = [
  { name: 'tokenizer_config.json', url: hub('tokenizer_config.json'), size: 443, sha256: 'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b' },
  { name: 'ort.node.min.mjs', url: cdn('ort.node.min.mjs'), size: 29181, sha256: '9bdb8aaab1d0deabe6f38572ad4d6f8b793bad8a5e184f8aa4fcc0d8cace7810' },
  { name: 'ort-wasm-simd-threaded.mjs', url: cdn('ort-wasm-simd-threaded.mjs'), size: 24738, sha256: '30ed0b5cd1182ede931fea448afb567d4dc705ec957af09f108a2be5f770dac3' },
  { name: 'ort-wasm-simd-threaded.wasm', url: cdn('ort-wasm-simd-threaded.wasm'), size: 14848852, sha256: '4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d' },
  { name: 'tokenizer.json', url: hub('tokenizer.json'), size: 17082730, sha256: '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39' },
  { name: 'model.onnx', url: hub('onnx/model_quantized.onnx'), size: 118308185, sha256: 'f80102d3f2a1229f387d3c81909990d8945513e347b0eab049f7de3c6f98c193' },
]
const TOTAL_BYTES = FILES.reduce((total, file) => total + file.size, 0)
const COMMON_PACKAGE = 'onnxruntime-common'

// Il pacchetto per la scheda video (WebGPU): lo stesso modello in fp16 (la GPU lavora meglio in virgola mobile che a 8 bit) e il runtime onnxruntime-web
// con il backend WebGPU, che gira in una finestra nascosta di Chromium (gpu-context.cjs). È un pacchetto a parte: chi non lo scarica non lo ha, e i suoi
// vettori sono di un altro modello (cambia la precisione) e stanno a parte nell'indice.
const GPU_PACK_ID = 'multilingual-e5-small-fp16-webgpu'
const GPU_FILES = [
  { name: 'tokenizer_config.json', url: hub('tokenizer_config.json'), size: 443, sha256: 'a1d6bc8734a6f635dc158508bef000f8e2e5a759c7d92f984b2c86e5ff53425b' },
  { name: 'ort.webgpu.bundle.min.mjs', url: cdn('ort.webgpu.bundle.min.mjs'), size: 122491, sha256: 'c90275ffcd0e74e8929f527840ce9339399bfd45f11a74887e4b81a893907b70' },
  { name: 'ort-wasm-simd-threaded.asyncify.mjs', url: cdn('ort-wasm-simd-threaded.asyncify.mjs'), size: 53457, sha256: '59cf781530e1a16df2a291d78798e3ec1152467edaec402d6f9599d85047c302' },
  { name: 'ort-wasm-simd-threaded.asyncify.wasm', url: cdn('ort-wasm-simd-threaded.asyncify.wasm'), size: 28747738, sha256: 'ca319e9539cd0f1e291cf56074760121eaf39650f5dbf84b6e52c07f4b2944ec' },
  { name: 'tokenizer.json', url: hub('tokenizer.json'), size: 17082730, sha256: '0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39' },
  { name: 'model.onnx', url: hub('onnx/model_fp16.onnx'), size: 235336732, sha256: '0e0fe349c99ea21c6f3aa273af21f7fb753c1e1174ef1647032029c2be3251c3' },
]
// `common`: il runtime ha bisogno del pacchetto npm onnxruntime-common accanto ai file (solo la versione CPU, in Node).
const PACKS = {
  cpu: { id: PACK_ID, files: FILES, common: true },
  gpu: { id: GPU_PACK_ID, files: GPU_FILES, common: false },
}

const sha256File = (file) => new Promise((resolve, reject) => {
  const hash = crypto.createHash('sha256')
  fs.createReadStream(file).on('data', (chunk) => hash.update(chunk)).on('error', reject).on('end', () => resolve(hash.digest('hex')))
})

// Copia una cartella file per file. Nell'app installata il pacchetto sta dentro app.asar: fs.cpSync non sa leggerlo (ENOENT), mentre readdirSync e
// copyFileSync, che Electron adatta agli asar, sì.
function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true })
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, entry.name)
    const target = path.join(to, entry.name)
    if (entry.isDirectory()) copyTree(source, target)
    else fs.copyFileSync(source, target)
  }
}

/**
 * `directory`: dove vive il pacchetto (nei dati dell'app); `fetchImpl`: `net.fetch` di Electron in produzione (segue proxy e certificati del
 * sistema), un finto nei test; `commonSource`: la cartella del pacchetto npm onnxruntime-common che l'app porta con sé (il runtime lo importa).
 */
function createSemanticPack({ directory, kind = 'cpu', fetchImpl = globalThis.fetch, commonSource = null, files = null }) {
  const spec = PACKS[kind]
  if (!spec) throw new Error(`Unknown pack kind: ${kind}`)
  files = files || spec.files
  const root = path.join(directory, spec.id)
  const total = files.reduce((sum, file) => sum + file.size, 0)
  let installing = null
  let progress = { received: 0, total, file: '' }
  let lastError = null

  const readyFile = () => path.join(root, 'ready.json')

  function isReady() {
    try {
      const marker = JSON.parse(fs.readFileSync(readyFile(), 'utf8'))
      if (marker.id !== spec.id) return false
      if (spec.common && !fs.existsSync(path.join(root, 'node_modules', COMMON_PACKAGE, 'package.json'))) return false
      return files.every((file) => fs.statSync(path.join(root, file.name)).size === file.size)
    } catch { return false }
  }

  async function download(file, signal, onBytes) {
    const target = path.join(root, file.name)
    // Un file già scaricato e verificato (da un tentativo interrotto) non si riscarica.
    try {
      if (fs.statSync(target).size === file.size && await sha256File(target) === file.sha256) { onBytes(file.size); return }
    } catch { /* manca: si scarica */ }
    const response = await fetchImpl(file.url, { signal, redirect: 'follow' })
    if (!response.ok || !response.body) throw new Error(`Download failed (${response.status}) for ${file.name}`)
    const part = `${target}.part`
    const out = fs.createWriteStream(part)
    const hash = crypto.createHash('sha256')
    let received = 0
    try {
      for await (const chunk of response.body) {
        hash.update(chunk)
        received += chunk.length
        if (received > file.size) throw new Error(`${file.name} is larger than expected`)
        if (!out.write(chunk)) await new Promise((resolve) => out.once('drain', resolve))
        onBytes(chunk.length)
      }
      await new Promise((resolve, reject) => { out.once('error', reject); out.end(resolve) })
    } catch (error) {
      out.destroy()
      fs.rmSync(part, { force: true })
      throw error
    }
    if (received !== file.size || hash.digest('hex') !== file.sha256) {
      fs.rmSync(part, { force: true })
      throw new Error(`${file.name} does not match the expected file`)
    }
    fs.renameSync(part, target)
  }

  async function run(onProgress, signal) {
    fs.mkdirSync(root, { recursive: true })
    fs.rmSync(readyFile(), { force: true })
    progress = { received: 0, total, file: '' }
    for (const file of files) {
      progress.file = file.name
      await download(file, signal, (bytes) => {
        progress.received += bytes
        onProgress?.({ ...progress })
      })
    }
    // Ciò che non è nel manifest (file di una versione precedente del pacchetto) si toglie: non deve restare a occupare spazio.
    const expected = new Set([...files.map((file) => file.name), 'node_modules', 'ready.json'])
    for (const entry of fs.readdirSync(root)) { if (!expected.has(entry)) fs.rmSync(path.join(root, entry), { recursive: true, force: true }) }
    if (spec.common && commonSource) copyTree(commonSource, path.join(root, 'node_modules', COMMON_PACKAGE))
    fs.writeFileSync(readyFile(), JSON.stringify({ id: spec.id, installedAt: Date.now(), files: files.map(({ name, size }) => ({ name, size })) }))
  }

  return {
    id: spec.id,
    kind,
    totalBytes: total,
    // La cartella con i file, da dare al lavoratore (solo se il pacchetto è pronto).
    get directory() { return root },
    get ready() { return isReady() },
    status() {
      if (installing) return { state: 'installing', ...progress, totalBytes: total, error: null }
      return { state: isReady() ? 'ready' : 'missing', received: 0, total, file: '', totalBytes: total, error: lastError }
    },
    // Scarica tutto (una sola installazione alla volta: chi richiama mentre è in corso riceve la stessa promessa). Rifiuta se la rete cade o un file non corrisponde.
    install({ onProgress, signal } = {}) {
      if (installing) return installing
      lastError = null
      installing = run(onProgress, signal)
        .catch((error) => { lastError = String(error?.message || error); throw error })
        .finally(() => { installing = null })
      return installing
    },
    remove() {
      if (installing) throw new Error('The download is in progress')
      fs.rmSync(root, { recursive: true, force: true })
      lastError = null
    },
  }
}

module.exports = { createSemanticPack, PACKS, PACK_ID, GPU_PACK_ID, FILES, GPU_FILES, TOTAL_BYTES, COMMON_PACKAGE }
