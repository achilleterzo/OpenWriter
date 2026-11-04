const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { Worker } = require('node:worker_threads')
const { createKnowledgeService } = require('../electron/knowledge-service.cjs')

/**
 * Prova con il modello vero (worker, WebAssembly, tokenizzatore). Si esegue solo se OW_SEMANTIC_PACK punta a un pacchetto installato
 * (la cartella `semantic/multilingual-e5-small-q8` dei dati dell'app): non scarica nulla da solo.
 */
const pack = process.env.OW_SEMANTIC_PACK
const skip = !pack || !fs.existsSync(path.join(pack, 'ready.json')) ? 'OW_SEMANTIC_PACK non impostata' : false

test('ricerca per significato con il modello vero: domande senza parole in comune', { skip, timeout: 120000 }, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-semantic-'))
  const project = path.join(directory, 'progetto')
  fs.mkdirSync(project)
  const docs = {
    'viaggio.md': "# Partenza\n\nIl protagonista lascia il villaggio all'alba, portando con sé solo una lettera della madre.\n",
    'mobile.md': '# Montaggio\n\nPer montare la libreria servono un cacciavite a croce e tutte le viti contenute nella busta.\n',
    'editoria.md': '# Contratto\n\nIl contratto prevede un anticipo del trenta per cento alla consegna del manoscritto.\n',
    'cucina.md': "# Ricetta\n\nLa ricetta richiede farina, uova e un pizzico di sale; l'impasto va lasciato riposare.\n",
    'treno.md': '# Orari\n\nIl treno per Milano parte dal binario cinque e arriva dopo circa due ore.\n',
  }
  for (const [name, text] of Object.entries(docs)) fs.writeFileSync(path.join(project, name), text)
  const keepAlive = setInterval(() => {}, 1000) // il worker è unref: senza questo il test uscirebbe mentre aspetta
  const service = createKnowledgeService({ file: path.join(directory, 'k.db'), hiddenDirectories: [], createWorker: (workerData) => new Worker(path.join(__dirname, '../electron/knowledge-worker.cjs'), { workerData }) })
  try {
    await service.sync(project)
    await service.semanticConfigure({ directory: pack, projects: [project], model: 'test' })
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const status = await service.semanticStatus([project])
      assert.equal(status.error, null)
      if (!status.running && status.embedded === status.total) break
      await new Promise((resolve) => setTimeout(resolve, 300))
    }
    assert.equal((await service.semanticStatus([project])).embedded, 5)
    const cases = [
      ['quali attrezzi occorrono per assemblare il mobile?', 'mobile.md'],
      ['quanto viene pagato in anticipo allo scrittore?', 'editoria.md'],
      ['chi parte di buon mattino da casa?', 'viaggio.md'],
      ['ingredienti per fare la pasta', 'cucina.md'],
    ]
    for (const [question, expected] of cases) {
      const found = await service.search(project, question, { semantic: true, limit: 3 })
      assert.equal(found.mode, 'hybrid')
      assert.equal(found.results[0].path, expected, question)
    }
    // Senza `semantic` la stessa domanda resta per parole.
    assert.notEqual((await service.search(project, cases[0][0], { limit: 3 })).mode, 'hybrid')
    // Tolto il pacchetto, la ricerca per parole continua e i vettori spariscono.
    await service.semanticConfigure({ directory: null, purge: true })
    assert.equal((await service.semanticStatus([project])).embedded, 0)
    assert.equal((await service.search(project, 'cacciavite', { semantic: true })).results[0].path, 'mobile.md')
  } finally {
    clearInterval(keepAlive)
    await service.close()
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
