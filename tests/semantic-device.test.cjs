const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { createKnowledgeService } = require('../electron/knowledge-service.cjs')

/**
 * Il dispositivo GPU senza una GPU: il worker chiede i vettori al processo principale (`gpuEmbed`), che qui è un finto deterministico. Si prova il
 * percorso completo (calcolare, salvare per modello, cercare, guastarsi, tornare a un altro dispositivo) senza modelli né scheda video.
 */
const fakeVector = (text) => {
  // Tre dimensioni: "mare/faro" contro "treno/pane": sufficiente per distinguere il significato.
  const sea = /faro|mare|nebbia|costa/i.test(text) ? 1 : 0.05
  const land = /treno|pane|ricetta/i.test(text) ? 1 : 0.05
  const norm = Math.hypot(sea, land, 0.1)
  return new Float32Array([sea / norm, land / norm, 0.1 / norm])
}

async function setup({ gpuEmbed, onSemanticError }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-device-'))
  const project = path.join(directory, 'progetto')
  fs.mkdirSync(project)
  fs.writeFileSync(path.join(project, 'costa.md'), '# Costa\n\nLa nebbia sul mare nascondeva il faro.\n')
  fs.writeFileSync(path.join(project, 'cucina.md'), '# Cucina\n\nLa ricetta del pane richiede lievito.\n')
  const keepAlive = setInterval(() => {}, 1000)
  const service = createKnowledgeService({ file: path.join(directory, 'k.db'), hiddenDirectories: [], createWorker: (workerData) => new Worker(path.join(__dirname, '../electron/knowledge-worker.cjs'), { workerData }), gpuEmbed, onSemanticError })
  const done = async () => { clearInterval(keepAlive); await service.close(); fs.rmSync(directory, { recursive: true, force: true }) }
  try { await service.sync(project) } catch (error) { await done(); throw error }
  const waitFor = async (check) => { for (let attempt = 0; attempt < 100; attempt += 1) { const status = await service.semanticStatus([project]); if (check(status)) return status; await new Promise((resolve) => setTimeout(resolve, 50)) } throw new Error('timeout') }
  return { service, project, done, waitFor }
}

test('dispositivo GPU: il worker chiede i vettori al processo principale; la ricerca per significato li usa', async () => {
  const calls = []
  const { service, project, done, waitFor } = await setup({ gpuEmbed: async (texts, kind) => { calls.push({ n: texts.length, kind }); return texts.map(fakeVector) } })
  try {
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake', projects: [project] })
    const status = await waitFor((value) => !value.running && value.embedded === value.total && value.total === 2)
    assert.equal(status.device, 'gpu')
    assert.equal(status.model, 'gpu-fake')
    assert.ok(calls.some((call) => call.kind === 'passage'))
    // "Navigare di notte" non ha parole in comune con i file, ma il vettore della domanda (kind 'query') cade sul mare.
    const found = await service.search(project, 'navigare di notte verso il mare aperto zzz', { semantic: true })
    assert.ok(calls.some((call) => call.kind === 'query'))
    assert.equal(found.mode, 'hybrid')
    assert.equal(found.results[0].path, 'costa.md')
    // Senza `semantic` resta per parole.
    assert.notEqual((await service.search(project, 'nebbia')).mode, 'hybrid')
  } finally { await done() }
})

test("dispositivi separati: cambiare modello non butta i vettori dell'altro e calcola solo ciò che manca", async () => {
  let gpuCalls = 0
  const { service, project, done, waitFor } = await setup({ gpuEmbed: async (texts) => { gpuCalls += texts.length; return texts.map(fakeVector) } })
  try {
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake', projects: [project] })
    await waitFor((value) => value.embedded === 2 && !value.running)
    assert.equal(gpuCalls, 2)
    // Si spegne e si riaccende lo stesso modello: i suoi vettori erano già nell'indice.
    await service.semanticConfigure({ device: null })
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake', projects: [project] })
    const again = await waitFor((value) => value.embedded === 2 && !value.running)
    assert.equal(again.embedded, 2)
    assert.equal(gpuCalls, 2, 'nessun ricalcolo: i vettori del modello erano già nell\'indice')
    // Un altro modello parte da zero e non disturba il primo.
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake-2', projects: [project] })
    await waitFor((value) => value.model === 'gpu-fake-2' && value.embedded === 2 && !value.running)
    assert.equal(gpuCalls, 4)
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake', projects: [project] })
    assert.equal((await waitFor((value) => value.model === 'gpu-fake' && !value.running)).embedded, 2)
    assert.equal(gpuCalls, 4)
    // Togliere un modello butta solo i suoi vettori.
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake-2', projects: [project], purge: ['gpu-fake'] })
    await waitFor((value) => value.model === 'gpu-fake-2' && !value.running)
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake', projects: [project] })
    await waitFor((value) => value.model === 'gpu-fake' && value.embedded === 2 && !value.running)
    assert.equal(gpuCalls, 6, 'i vettori di gpu-fake erano stati buttati: si ricalcolano')
  } finally { await done() }
})

test("guasto della GPU: l'errore arriva a chi gestisce, la ricerca per parole continua", async () => {
  const errors = []
  const { service, project, done, waitFor } = await setup({ gpuEmbed: async () => { throw new Error('WebGPU device lost') }, onSemanticError: (event) => errors.push(event) })
  try {
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake', projects: [project] })
    const status = await waitFor((value) => value.error)
    assert.match(status.error, /device lost/)
    assert.equal(errors[0].device, 'gpu')
    assert.equal(errors[0].model, 'gpu-fake')
    assert.equal((await service.search(project, 'nebbia', { semantic: true })).results[0].path, 'costa.md')
    // Chi gestisce passa a un altro dispositivo (qui: spento) e l'errore sparisce.
    await service.semanticConfigure({ device: null })
    assert.equal((await service.semanticStatus([project])).error, null)
  } finally { await done() }
})

test('senza gpuEmbed (nessuna GPU) il dispositivo GPU fallisce con un messaggio chiaro, non si blocca', async () => {
  const { service, project, done, waitFor } = await setup({})
  try {
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake', projects: [project] })
    assert.match((await waitFor((value) => value.error)).error, /GPU is not available/)
  } finally { await done() }
})

test('riconfigurare mentre i vettori si calcolano: nessun errore e il calcolo riparte con la nuova configurazione', async () => {
  let release = null
  const gate = new Promise((resolve) => { release = resolve })
  let first = true
  const { service, project, done, waitFor } = await setup({
    gpuEmbed: async (texts) => {
      if (first) { first = false; await gate } // il primo gruppo resta in attesa mentre si cambia modello
      return texts.map(fakeVector)
    },
  })
  try {
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake', projects: [project] })
    await waitFor((value) => value.running)
    await service.semanticConfigure({ device: 'gpu', model: 'gpu-fake-2', projects: [project] })
    release()
    const status = await waitFor((value) => value.model === 'gpu-fake-2' && value.embedded === 2 && !value.running)
    assert.equal(status.error, null)
  } finally { release?.(); await done() }
})
