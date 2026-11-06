const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { createKnowledgeIndex } = require('../electron/knowledge-index.cjs')
const { syncTree, syncPaths } = require('../electron/knowledge-sync.cjs')
const { createKnowledgeService } = require('../electron/knowledge-service.cjs')

function project(files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-sync-'))
  const write = (relative, text) => {
    const full = path.join(directory, ...relative.split('/'))
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, text)
  }
  for (const [relative, text] of Object.entries(files)) write(relative, text)
  return { directory, write, remove: () => fs.rmSync(directory, { recursive: true, force: true }) }
}

test('syncTree: indicizza i documenti di testo e salta nascosti, .ow, node_modules, cartelle nascoste e altri formati', async () => {
  const p = project({
    'a.md': '# A\n\nluna piena',
    'sub/b.txt': 'sole alto',
    'sub/c.markdown': 'stella',
    '.ow/context.md': 'segreto',
    '.nascosto.md': 'segreto',
    'node_modules/x/y.md': 'segreto',
    'dist/z.md': 'segreto',
    'immagine.png': 'non testo',
  })
  try {
    const index = createKnowledgeIndex({ file: ':memory:' })
    const summary = await syncTree(index, p.directory, '', new Set(['dist']))
    assert.equal(summary.indexed, 3)
    assert.deepEqual([...index.listFiles(p.directory).keys()].sort(), ['a.md', 'sub/b.txt', 'sub/c.markdown'])
    assert.equal(index.search(p.directory, 'segreto').results.length, 0)
  } finally { p.remove() }
})

test('syncTree: una seconda scansione non rilegge nulla; cambia solo ciò che è cambiato o sparito', async () => {
  const p = project({ 'a.md': 'prima', 'b.md': 'resta' })
  try {
    const index = createKnowledgeIndex({ file: ':memory:' })
    await syncTree(index, p.directory)
    assert.deepEqual(await syncTree(index, p.directory), { indexed: 0, removed: 0, unchanged: 2 })
    p.write('a.md', 'seconda versione più lunga')
    fs.rmSync(path.join(p.directory, 'b.md'))
    p.write('c.md', 'nuovo')
    const summary = await syncTree(index, p.directory)
    assert.deepEqual(summary, { indexed: 2, removed: 1, unchanged: 0 })
    assert.equal(index.search(p.directory, 'seconda').results.length, 1)
    assert.equal(index.search(p.directory, 'resta').results.length, 0)
  } finally { p.remove() }
})

test('syncPaths: file nuovo, modificato, eliminato, cartella eliminata, cartella arrivata dal di fuori', async () => {
  const p = project({ 'a.md': 'alfa', 'dir/b.md': 'beta', 'dir/sub/c.md': 'gamma' })
  try {
    const index = createKnowledgeIndex({ file: ':memory:' })
    await syncTree(index, p.directory)
    p.write('nuovo.md', 'delta')
    p.write('a.md', 'alfa modificato')
    await syncPaths(index, p.directory, ['nuovo.md', 'a.md'])
    assert.equal(index.search(p.directory, 'delta').results.length, 1)
    assert.equal(index.search(p.directory, 'modificato').results.length, 1)

    fs.rmSync(path.join(p.directory, 'dir'), { recursive: true })
    await syncPaths(index, p.directory, ['dir'])
    assert.deepEqual([...index.listFiles(p.directory).keys()].sort(), ['a.md', 'nuovo.md'])

    p.write('arrivata/x.md', 'epsilon')
    p.write('arrivata/y/z.md', 'zeta')
    await syncPaths(index, p.directory, ['arrivata'])
    assert.equal(index.search(p.directory, 'zeta').results[0].path, 'arrivata/y/z.md')

    // Rinominare una cartella: il vecchio nome sparisce, il nuovo entra.
    fs.renameSync(path.join(p.directory, 'arrivata'), path.join(p.directory, 'spostata'))
    await syncPaths(index, p.directory, ['arrivata', 'spostata'])
    assert.equal(index.search(p.directory, 'epsilon').results[0].path, 'spostata/x.md')
    assert.equal(index.listFiles(p.directory).has('arrivata/x.md'), false)
  } finally { p.remove() }
})

test('syncPaths: un file rinominato con nome nascosto o con estensione non indicizzata esce dall\'indice', async () => {
  const p = project({ 'a.md': 'testo', 'b.md': 'altro' })
  try {
    const index = createKnowledgeIndex({ file: ':memory:' })
    await syncTree(index, p.directory)
    fs.renameSync(path.join(p.directory, 'a.md'), path.join(p.directory, '.a.md'))
    fs.renameSync(path.join(p.directory, 'b.md'), path.join(p.directory, 'b.docx'))
    await syncPaths(index, p.directory, ['a.md', '.a.md', 'b.md', 'b.docx'])
    assert.deepEqual([...index.listFiles(p.directory).keys()], [])
  } finally { p.remove() }
})

test('servizio con worker: scansione, ricerca, aggiornamento per percorsi, ricostruzione', async () => {
  const p = project({ 'a.md': '# Faro\n\nIl faro splende sul mare.' })
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-service-'))
  const service = createKnowledgeService({
    file: path.join(directory, 'knowledge.db'),
    createWorker: (workerData) => new Worker(path.join(__dirname, '..', 'electron', 'knowledge-worker.cjs'), { workerData }),
    debounceMs: 20,
  })
  // Il worker non tiene vivo il processo (è unref): senza un altro handle attivo il test potrebbe finire mentre aspetta la risposta.
  const keepAlive = setInterval(() => {}, 1000)
  try {
    const scan = await service.sync(p.directory)
    assert.equal(scan.indexed, 1)
    const found = await service.search(p.directory, 'faro mare')
    assert.equal(found.results[0].path, 'a.md')

    p.write('b.md', 'La nebbia copre tutto.')
    service.changed(p.directory, ['b.md'])
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal((await service.search(p.directory, 'nebbia')).results.length, 1)
    assert.equal((await service.stats(p.directory)).files, 2)

    fs.rmSync(path.join(p.directory, 'b.md'))
    service.changed(p.directory, ['b.md'])
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal((await service.search(p.directory, 'nebbia')).results.length, 0)

    const rebuilt = await service.rebuild(p.directory)
    assert.equal(rebuilt.indexed, 1)
    assert.equal(service.available, true)
  } finally {
    await service.close()
    clearInterval(keepAlive)
    p.remove()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('servizio: se il worker non parte, non è disponibile e le richieste falliscono con un errore chiaro', async () => {
  const service = createKnowledgeService({ file: ':memory:', createWorker: () => { throw new Error('nessun worker') } })
  await assert.rejects(() => service.search('x', 'y'), /nessun worker/)
  assert.equal(service.available, false)
  assert.doesNotThrow(() => service.changed('x', ['a.md']))
  await service.close()
})

test('formatKnowledgeResults: elenco con file e righe, ripiego, vuoto e indice non pronto', () => {
  const { formatKnowledgeResults } = require('../electron/knowledge-service.cjs')
  const results = [{ path: 'a.md', heading: 'Libro › Cap 1', startLine: 3, endLine: 9, snippet: 'il «faro»\n splende', score: 1 }]
  const text = formatKnowledgeResults('faro', { mode: 'and', results }, { files: 4 })
  assert.match(text, /1 passage for “faro”/)
  assert.match(text, /1\. a\.md:3-9 — Libro › Cap 1\n {3}il «faro» splende/)
  assert.match(text, /read_file/)
  assert.match(formatKnowledgeResults('faro luna', { mode: 'or', results }, { files: 4 }), /at least one/)
  assert.match(formatKnowledgeResults('x', { mode: 'and', results: [] }, { files: 4 }), /Nothing found/)
  assert.match(formatKnowledgeResults('x', { mode: 'and', results: [] }, { files: 0 }), /still being built/)
})
