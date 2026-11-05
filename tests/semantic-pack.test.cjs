const test = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createSemanticPack, FILES, PACK_ID } = require('../electron/semantic-pack.cjs')

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex')
const content = { 'a.bin': Buffer.alloc(300_000, 7), 'b.txt': Buffer.from('ciao mondo') }
const files = Object.entries(content).map(([name, buffer]) => ({ name, url: `https://example.test/${name}`, size: buffer.length, sha256: sha(buffer) }))

// Un fetch finto: serve i contenuti a pezzi, come uno stream vero. `tamper` altera un file; `calls` conta le richieste.
function fakeFetch({ tamper = null, status = 200 } = {}) {
  const calls = []
  const impl = async (url, { signal } = {}) => {
    const name = url.split('/').pop()
    calls.push(name)
    if (status !== 200) return { ok: false, status, body: null }
    let buffer = content[name]
    if (tamper === name) buffer = Buffer.concat([buffer.subarray(0, buffer.length - 1), Buffer.from([1])])
    async function* body() {
      for (let at = 0; at < buffer.length; at += 100_000) {
        if (signal?.aborted) throw new Error('aborted')
        yield buffer.subarray(at, at + 100_000)
      }
    }
    return { ok: true, status: 200, body: body() }
  }
  impl.calls = calls
  return impl
}

function setup(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-pack-'))
  const common = path.join(directory, 'common-src')
  fs.mkdirSync(path.join(common, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(common, 'package.json'), '{"name":"onnxruntime-common"}')
  fs.writeFileSync(path.join(common, 'dist', 'index.js'), 'x')
  const fetchImpl = options.fetchImpl || fakeFetch()
  const pack = createSemanticPack({ directory: path.join(directory, 'data'), fetchImpl, commonSource: common, files })
  return { directory, pack, fetchImpl }
}

test('il manifest reale ha versioni e controlli fissati', () => {
  assert.ok(FILES.length >= 6)
  for (const file of FILES) {
    assert.match(file.sha256, /^[0-9a-f]{64}$/, file.name)
    assert.ok(file.size > 0)
    assert.match(file.url, /^https:\/\//)
  }
  assert.ok(FILES.some((file) => /\/761b726dd34fb83930e26aab4e9ac3899aa1fa78\//.test(file.url)), 'il modello è fissato a una revisione')
  assert.ok(FILES.some((file) => /onnxruntime-web@1\.31\.1\//.test(file.url)), 'il runtime è fissato a una versione')
})

test('installazione: scarica, verifica, copia onnxruntime-common e segna il pacchetto pronto', async () => {
  const { directory, pack, fetchImpl } = setup()
  try {
    assert.equal(pack.status().state, 'missing')
    assert.equal(pack.ready, false)
    const seen = []
    await pack.install({ onProgress: (progress) => seen.push(progress.received) })
    assert.equal(pack.ready, true)
    assert.equal(pack.status().state, 'ready')
    assert.deepEqual(fs.readFileSync(path.join(pack.directory, 'b.txt')), content['b.txt'])
    assert.ok(fs.existsSync(path.join(pack.directory, 'node_modules', 'onnxruntime-common', 'dist', 'index.js')))
    assert.ok(!fs.readdirSync(pack.directory).some((name) => name.endsWith('.part')))
    assert.equal(seen.at(-1), files.reduce((total, file) => total + file.size, 0))
    assert.ok(seen.every((value, position) => position === 0 || value >= seen[position - 1]), "l'avanzamento non torna indietro")
    assert.equal(path.basename(pack.directory), PACK_ID)
    assert.equal(fetchImpl.calls.length, 2)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('un file diverso da quello atteso si scarta: nessun pacchetto pronto, nessun residuo', async () => {
  const { directory, pack } = setup({ fetchImpl: fakeFetch({ tamper: 'b.txt' }) })
  try {
    await assert.rejects(pack.install(), /does not match/)
    assert.equal(pack.ready, false)
    assert.match(pack.status().error, /does not match/)
    assert.ok(!fs.existsSync(path.join(pack.directory, 'b.txt')))
    assert.ok(!fs.existsSync(path.join(pack.directory, 'b.txt.part')))
    assert.ok(!fs.existsSync(path.join(pack.directory, 'ready.json')))
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('errore di rete: si riprova senza riscaricare ciò che è già a posto', async () => {
  const { directory, pack } = setup({ fetchImpl: fakeFetch({ tamper: 'b.txt' }) })
  try {
    await assert.rejects(pack.install())
    // Riprova con la rete a posto: a.bin era già verificato e non si riscarica.
    const second = fakeFetch()
    const retry = createSemanticPack({ directory: path.join(directory, 'data'), fetchImpl: second, commonSource: path.join(directory, 'common-src'), files })
    await retry.install()
    assert.equal(retry.ready, true)
    assert.deepEqual(second.calls, ['b.txt'])
    const failing = createSemanticPack({ directory: path.join(directory, 'altro'), fetchImpl: fakeFetch({ status: 503 }), files })
    await assert.rejects(failing.install(), /503/)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('una sola installazione alla volta; non si rimuove mentre scarica; si può togliere', async () => {
  const { directory, pack } = setup()
  try {
    const first = pack.install()
    assert.equal(pack.install(), first)
    assert.equal(pack.status().state, 'installing')
    assert.throws(() => pack.remove(), /in progress/)
    await first
    pack.remove()
    assert.equal(pack.ready, false)
    assert.ok(!fs.existsSync(pack.directory))
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('un file troncato rende il pacchetto non pronto', async () => {
  const { directory, pack } = setup()
  try {
    await pack.install()
    fs.writeFileSync(path.join(pack.directory, 'a.bin'), 'troncato')
    assert.equal(pack.ready, false)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

// ----- Il pacchetto per la scheda video -----
const { PACKS, GPU_PACK_ID, GPU_FILES } = require('../electron/semantic-pack.cjs')

test('il pacchetto GPU ha un identificativo suo, il modello fp16 e il runtime WebGPU (variante asyncify) con controlli fissati', () => {
  assert.notEqual(PACKS.gpu.id, PACKS.cpu.id)
  assert.equal(PACKS.gpu.id, GPU_PACK_ID)
  assert.equal(PACKS.gpu.common, false)
  const names = GPU_FILES.map((file) => file.name)
  for (const name of ['model.onnx', 'tokenizer.json', 'tokenizer_config.json', 'ort.webgpu.bundle.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) assert.ok(names.includes(name), name)
  assert.ok(!names.some((name) => name.includes('jsep')), 'la variante jsep non ha il backend WebGPU della 1.31')
  for (const file of GPU_FILES) { assert.match(file.sha256, /^[0-9a-f]{64}$/, file.name); assert.match(file.url, /^https:\/\//) }
  assert.ok(GPU_FILES.find((file) => file.name === 'model.onnx').url.includes('model_fp16.onnx'))
})

test('installare il pacchetto GPU: niente onnxruntime-common, cartella propria, e i file di una versione precedente si tolgono', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-gpupack-'))
  try {
    const gpu = createSemanticPack({ directory, kind: 'gpu', fetchImpl: fakeFetch(), files })
    const cpu = createSemanticPack({ directory, kind: 'cpu', fetchImpl: fakeFetch(), files })
    assert.notEqual(gpu.directory, cpu.directory)
    // File rimasto da una versione precedente del pacchetto.
    fs.mkdirSync(gpu.directory, { recursive: true })
    fs.writeFileSync(path.join(gpu.directory, 'ort-wasm-simd-threaded.jsep.wasm'), 'vecchio')
    await gpu.install()
    assert.equal(gpu.ready, true, 'il pacchetto GPU non richiede onnxruntime-common')
    assert.equal(cpu.ready, false, "quello CPU è un'altra cartella, ancora da scaricare")
    assert.ok(!fs.existsSync(path.join(gpu.directory, 'ort-wasm-simd-threaded.jsep.wasm')))
    assert.deepEqual(fs.readdirSync(gpu.directory).sort(), ['a.bin', 'b.txt', 'ready.json'])
    gpu.remove()
    assert.equal(gpu.ready, false)
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})
