const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createKnowledgeIndex, chunkMarkdown, buildMatchQuery, relevantNeighbors, SCHEMA_VERSION } = require('../electron/knowledge-index.cjs')

const P = 'D:/progetto'
const memory = () => createKnowledgeIndex({ file: ':memory:' })

test('chunkMarkdown: percorso delle intestazioni e righe', () => {
  const chunks = chunkMarkdown('# Libro\n\nIntro.\n\n## Capitolo 1\n\nPrimo testo.\nSeconda riga.\n\n### Scena\n\nUna scena.\n')
  assert.deepEqual(chunks.map((c) => [c.heading, c.startLine, c.endLine, c.text]), [
    ['Libro', 3, 3, 'Intro.'],
    ['Libro › Capitolo 1', 7, 8, 'Primo testo.\nSeconda riga.'],
    ['Libro › Capitolo 1 › Scena', 12, 12, 'Una scena.'],
  ])
})

test('chunkMarkdown: un livello superiore chiude i sotto-livelli', () => {
  const chunks = chunkMarkdown('# A\n## B\ntesto b\n# C\ntesto c')
  assert.deepEqual(chunks.map((c) => c.heading), ['A › B', 'C'])
})

test('chunkMarkdown: le intestazioni nei blocchi di codice non contano', () => {
  const chunks = chunkMarkdown('# Titolo\n\n```\n# non è un titolo\n```\n\nfine')
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0].heading, 'Titolo')
  assert.match(chunks[0].text, /non è un titolo/)
})

test('chunkMarkdown: una sezione lunga si divide, una vuota non produce frammenti, CRLF è tollerato', () => {
  const paragraph = (n) => Array.from({ length: 100 }, (_, i) => `parola${n}x${i}`).join(' ')
  const long = chunkMarkdown(`# T\r\n\r\n${paragraph(1)}\r\n\r\n${paragraph(2)}\r\n\r\n${paragraph(3)}\r\n`, { maxWords: 250 })
  assert.equal(long.length, 2)
  assert.ok(long.every((c) => c.heading === 'T'))
  assert.deepEqual(chunkMarkdown('# Solo titolo\n'), [])
  assert.deepEqual(chunkMarkdown(''), [])
})

test('chunkMarkdown: un paragrafo enorme si spezza per frasi', () => {
  const sentence = (n) => `${Array.from({ length: 60 }, (_, i) => `w${n}x${i}`).join(' ')}.`
  const chunks = chunkMarkdown([1, 2, 3, 4, 5].map(sentence).join(' '), { maxWords: 130 })
  assert.ok(chunks.length >= 3)
  assert.ok(chunks.every((c) => c.text.split(/\s+/).length <= 130))
})

test('buildMatchQuery: virgolette, prefisso sull\'ultima parola, frasi, operatori neutralizzati', () => {
  assert.equal(buildMatchQuery('ciao mondo'), '"ciao" "mondo"*')
  assert.equal(buildMatchQuery('ciao mondo', 'or'), '"ciao" OR "mondo"*')
  assert.equal(buildMatchQuery('"capitolo secondo" luce'), '"capitolo secondo" "luce"')
  assert.equal(buildMatchQuery('NEAR(a b) AND c.de'), '"NEAR" "a" "b" "AND" "c" "de"*')
  assert.equal(buildMatchQuery('   ... !!! '), '')
  assert.equal(buildMatchQuery('a'), '"a"')
})

test('search: ordina per rilevanza, ignora gli accenti, trova per prefisso', () => {
  const index = memory()
  index.indexFile(P, 'a.md', '# Cucina\n\nIl caffè è pronto e il caffè è caldo.\n')
  index.indexFile(P, 'b.md', '# Altro\n\nUna volta ho bevuto un caffè in piazza.\n')
  index.indexFile(P, 'c.md', '# Treni\n\nIl convoglio parte dal binario cinque.\n')
  const accents = index.search(P, 'caffe')
  assert.equal(accents.mode, 'and')
  assert.deepEqual(accents.results.map((r) => r.path), ['a.md', 'b.md'])
  assert.match(accents.results[0].snippet, /«caffè»/)
  assert.equal(index.search(P, 'convo').results[0].path, 'c.md')
  assert.equal(index.search(P, 'binario cinque').results[0].startLine, 3)
})

test('search: il titolo pesa più del testo e compare nel risultato', () => {
  const index = memory()
  index.indexFile(P, 'testo.md', '# Varie\n\nQui si parla anche di draghi, una volta.\n')
  index.indexFile(P, 'titolo.md', '# Draghi\n\nUn capitolo qualsiasi.\n')
  const [first] = index.search(P, 'draghi').results
  assert.equal(first.path, 'titolo.md')
  assert.equal(first.heading, 'Draghi')
})

test('search: se non ci sono corrispondenze con tutte le parole, ripiega su almeno una', () => {
  const index = memory()
  index.indexFile(P, 'a.md', 'Solo la parola luna.')
  const found = index.search(P, 'luna sole')
  assert.equal(found.mode, 'or')
  assert.equal(found.results.length, 1)
  assert.deepEqual(index.search(P, 'inesistente').results, [])
  assert.deepEqual(index.search(P, '???').results, [])
})

test('search: input con sintassi FTS5 o punteggiatura non solleva errori', () => {
  const index = memory()
  index.indexFile(P, 'a.md', 'Testo qualsiasi con c.d e NEAR.')
  for (const query of ['"', 'a OR', 'NEAR(', '*', 'c.d', '(a', 'a:b', "l'albero", '-x', 'x^']) assert.doesNotThrow(() => index.search(P, query), query)
})

test('search: cartella, limite e massimo per file', () => {
  const index = memory()
  for (let i = 0; i < 6; i += 1) index.indexFile(P, `romanzo/c${i}.md`, `# Titolo ${i}\n\nIl faro splende.\n\nIl faro cade.\n\nIl faro ride.\n\nIl faro dorme.\n`)
  index.indexFile(P, 'saggi/s.md', 'Il faro nei saggi.')
  assert.equal(index.search(P, 'faro', { folder: 'saggi' }).results.length, 1)
  assert.equal(index.search(P, 'faro', { folder: 'saggi/s.md' }).results.length, 1)
  assert.equal(index.search(P, 'faro', { folder: 'romanzo/', limit: 4 }).results.length, 4)
  const perFile = index.search(P, 'faro', { folder: 'romanzo', limit: 50, maxPerFile: 1 }).results
  assert.equal(perFile.length, 6)
  assert.equal(new Set(perFile.map((r) => r.path)).size, 6)
})

test('search: i progetti restano separati', () => {
  const index = memory()
  index.indexFile('A', 'x.md', 'segreto del progetto A')
  index.indexFile('B', 'y.md', 'altro testo')
  assert.equal(index.search('A', 'segreto').results.length, 1)
  assert.equal(index.search('B', 'segreto').results.length, 0)
})

test('indexFile: testo invariato non si reindicizza; una modifica sostituisce i frammenti', () => {
  const index = memory()
  assert.equal(index.indexFile(P, 'a.md', 'prima versione').changed, true)
  assert.equal(index.indexFile(P, 'a.md', 'prima versione', { mtimeMs: 5, size: 14 }).changed, false)
  assert.equal(index.listFiles(P).get('a.md').mtimeMs, 5)
  assert.equal(index.indexFile(P, 'a.md', 'seconda versione').changed, true)
  assert.equal(index.search(P, 'prima').results.length, 0)
  assert.equal(index.search(P, 'seconda').results.length, 1)
  assert.equal(index.stats(P).files, 1)
})

test('removeFile, removePath e clearProject tolgono anche dalla ricerca', () => {
  const index = memory()
  index.indexFile(P, 'a.md', 'unico gatto')
  index.indexFile(P, 'dir/b.md', 'unico cane')
  index.indexFile(P, 'dir/sub/c.md', 'unico topo')
  index.indexFile(P, 'dir2/d.md', 'unico pesce')
  assert.equal(index.removeFile(P, 'a.md'), true)
  assert.equal(index.removeFile(P, 'a.md'), false)
  assert.equal(index.removePath(P, 'dir'), 2)
  assert.deepEqual(index.search(P, 'unico').results.map((r) => r.path), ['dir2/d.md'])
  assert.equal(index.clearProject(P), 1)
  assert.deepEqual(index.stats(P), { files: 0, chunks: 0, updatedAt: null })
  assert.equal(index.search(P, 'unico').results.length, 0)
})

test('movePath: file e cartelle cambiano percorso senza reindicizzare; la destinazione occupata si scarta', () => {
  const index = memory()
  index.indexFile(P, 'old/a.md', 'storia del vecchio')
  index.indexFile(P, 'old/sub/b.md', 'storia del vecchio sotto')
  index.indexFile(P, 'older.md', 'storia di un altro file')
  index.indexFile(P, 'new/a.md', 'file che verrà sovrascritto')
  assert.equal(index.movePath(P, 'old', 'new'), 2)
  assert.deepEqual([...index.listFiles(P).keys()].sort(), ['new/a.md', 'new/sub/b.md', 'older.md'])
  assert.equal(index.search(P, 'sovrascritto').results.length, 0)
  assert.equal(index.search(P, 'vecchio sotto').results[0].path, 'new/sub/b.md')
  assert.equal(index.movePath(P, 'older.md', 'moved.md'), 1)
  assert.equal(index.search(P, 'altro file').results[0].path, 'moved.md')
})

test('percorsi con % e _ non fanno da jolly', () => {
  const index = memory()
  index.indexFile(P, '100%/a.md', 'testo uno')
  index.indexFile(P, '1000/b.md', 'testo due')
  assert.equal(index.removePath(P, '100%'), 1)
  assert.deepEqual([...index.listFiles(P).keys()], ['1000/b.md'])
})

test('su disco: persiste, si apre da due connessioni e si ricostruisce se corrotto o di un\'altra versione', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-index-'))
  const file = path.join(directory, 'knowledge.db')
  try {
    const writer = createKnowledgeIndex({ file })
    writer.indexFile(P, 'a.md', '# Titolo\n\nTesto persistente.')
    const reader = createKnowledgeIndex({ file })
    assert.equal(reader.search(P, 'persistente').results.length, 1)
    reader.close()
    writer.close()

    const reopened = createKnowledgeIndex({ file })
    assert.equal(reopened.stats(P).files, 1)
    reopened.close()

    const { DatabaseSync } = require('node:sqlite')
    const old = new DatabaseSync(file)
    old.prepare("update meta set value = ? where key = 'schema'").run(String(SCHEMA_VERSION + 1))
    old.close()
    const upgraded = createKnowledgeIndex({ file })
    assert.equal(upgraded.stats(P).files, 0)
    upgraded.indexFile(P, 'b.md', 'dopo la migrazione')
    upgraded.close()

    fs.writeFileSync(file, 'questo non è un database SQLite, '.repeat(100))
    for (const suffix of ['-wal', '-shm']) fs.rmSync(`${file}${suffix}`, { force: true })
    const rebuilt = createKnowledgeIndex({ file })
    assert.equal(rebuilt.stats(P).files, 0)
    rebuilt.indexFile(P, 'c.md', 'di nuovo funzionante')
    assert.equal(rebuilt.search(P, 'funzionante').results.length, 1)
    rebuilt.close()
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('sola lettura: cerca mentre un altro lo scrive, e non crea né rifà nulla', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-readonly-'))
  const file = path.join(directory, 'knowledge.db')
  try {
    assert.throws(() => createKnowledgeIndex({ file, readOnly: true }))
    assert.equal(fs.existsSync(file), false)
    const writer = createKnowledgeIndex({ file })
    writer.indexFile(P, 'a.md', '# Titolo\n\nUn testo da cercare.')
    const reader = createKnowledgeIndex({ file, readOnly: true })
    assert.equal(reader.search(P, 'cercare').results.length, 1)
    assert.equal(reader.stats(P).files, 1)
    assert.throws(() => reader.indexFile(P, 'b.md', 'non deve scrivere'))
    writer.indexFile(P, 'c.md', 'un secondo testo da cercare')
    assert.equal(reader.search(P, 'secondo').results.length, 1)
    reader.close()
    writer.close()

    const { DatabaseSync } = require('node:sqlite')
    const old = new DatabaseSync(file)
    old.prepare("update meta set value = ? where key = 'schema'").run(String(SCHEMA_VERSION + 1))
    old.close()
    assert.throws(() => createKnowledgeIndex({ file, readOnly: true }), /another version/)
    assert.equal(fs.existsSync(file), true)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('search su più progetti: ogni risultato dice da dove viene; stesso percorso in due fonti non si confonde', () => {
  const index = memory()
  index.indexFile('A', 'nota.md', 'Il faro di A.')
  index.indexFile('B', 'nota.md', 'Il faro di B, più lungo e più faro del faro.')
  index.indexFile('C', 'x.md', 'Il faro di C non va cercato.')
  const both = index.search(['A', 'B'], 'faro', { maxPerFile: 1 }).results
  assert.deepEqual(both.map((r) => r.project).sort(), ['A', 'B'])
  assert.ok(both.every((r) => r.path === 'nota.md'))
  assert.equal(index.search('A', 'faro').results[0].project, 'A')
  assert.deepEqual(index.search([], 'faro').results, [])
  assert.equal(index.search(['A', 'B'], 'faro', { folder: 'nota.md' }).results.length, 2)
  assert.equal(index.search(['A'], 'faro', { folder: 'altro' }).results.length, 0)
})

// ----- Ricerca per significato: vettori finti a 3 dimensioni (gli embedding veri si provano in tests/semantic-search.test.cjs) -----
const { fuseRanked, embeddingText } = require('../electron/knowledge-index.cjs')
const M = 'cpu-q8'
const unit = (...values) => { const norm = Math.hypot(...values); return new Float32Array(values.map((value) => value / norm)) }
// Dà a ogni frammento in sospeso (per il modello) il vettore scelto da `pick(testo)`.
function embedAll(index, projects, pick, model = M) {
  const pending = index.pendingEmbeddings(projects, model, 100)
  index.storeEmbeddings(model, pending.map((item) => ({ hash: item.hash, vector: pick(item.text) })))
  return pending.length
}

test('fuseRanked: chi sta in alto in entrambi gli elenchi vince; l\'etichetta dice da dove viene', () => {
  const a = { id: 1, snippet: '«uno»' }
  const b = { id: 2, snippet: 'due' }
  const c = { id: 3, snippet: 'tre' }
  const fused = fuseRanked([[a, b], [c, a]])
  assert.deepEqual(fused.map((row) => [row.id, row.via]), [[1, 'both'], [3, 'meaning'], [2, 'words']])
  assert.equal(fused[0].snippet, '«uno»')
  assert.deepEqual(fuseRanked([[], []]), [])
})

test('vettori: si calcolano solo per i frammenti nuovi o cambiati e si buttano quando il frammento sparisce', () => {
  const index = memory()
  index.indexFile(P, 'a.md', '# A\n\nIl faro segnala la costa.\n')
  index.indexFile(P, 'b.md', '# B\n\nLa ricetta del pane.\n')
  assert.deepEqual(index.embeddingStats([P], M), { total: 2, embedded: 0 })
  assert.equal(embedAll(index, [P], () => unit(1, 0, 0)), 2)
  assert.deepEqual(index.embeddingStats([P], M), { total: 2, embedded: 2 })
  assert.equal(index.pendingEmbeddings([P], M, 10).length, 0)
  // Un file riscritto uguale non ricalcola nulla; uno cambiato ricalcola solo il suo frammento.
  index.indexFile(P, 'a.md', '# A\n\nIl faro segnala la costa.\n', { mtimeMs: 5 })
  assert.equal(index.pendingEmbeddings([P], M, 10).length, 0)
  index.indexFile(P, 'a.md', '# A\n\nIl faro segnala gli scogli.\n')
  assert.equal(index.pendingEmbeddings([P], M, 10).length, 1)
  embedAll(index, [P], () => unit(0, 1, 0))
  assert.equal(index.pruneEmbeddings(), 1) // il vettore del vecchio testo di a.md
  assert.deepEqual(index.embeddingStats([P], M), { total: 2, embedded: 2 })
  // Solo i progetti chiesti: gli altri non si calcolano.
  index.indexFile('altro', 'x.md', 'Un testo di un altro progetto.')
  assert.equal(index.pendingEmbeddings([P], M, 10).length, 0)
  assert.equal(index.pendingEmbeddings(['altro'], M, 10).length, 1)
  assert.equal(index.pendingEmbeddings([], M, 10).length, 0)
  assert.equal(embeddingText('A › B', 'testo'), 'A › B\ntesto')
})

test('ricerca ibrida: il significato trova ciò che le parole non trovano; senza vettore la ricerca resta per parole', () => {
  const index = memory()
  index.indexFile(P, 'mobile.md', '# Montaggio\n\nServe un cacciavite a croce.\n')
  index.indexFile(P, 'pane.md', '# Ricetta\n\nFarina, acqua e lievito.\n')
  embedAll(index, [P], (text) => (/cacciavite/.test(text) ? unit(1, 0.2, 0) : unit(0, 0.2, 1)))
  const domanda = unit(1, 0.1, 0) // "attrezzi per assemblare": nessuna parola in comune
  assert.equal(index.search(P, 'attrezzi per assemblare').results.length, 0)
  const ibrida = index.search(P, 'attrezzi per assemblare', { queryVector: domanda, model: M })
  assert.equal(ibrida.mode, 'hybrid')
  assert.equal(ibrida.results[0].path, 'mobile.md')
  assert.match(ibrida.results[0].snippet, /cacciavite/)
  assert.equal(ibrida.results[0].via, 'meaning')
  // Una parola presente e il significato concordi: il frammento è 'both' e conserva l'evidenziazione.
  const entrambi = index.search(P, 'cacciavite', { queryVector: domanda, model: M })
  assert.equal(entrambi.results[0].path, 'mobile.md')
  assert.equal(entrambi.results[0].via, 'both')
  assert.match(entrambi.results[0].snippet, /«cacciavite»/)
  // In ibrida "almeno una parola" non entra: una parola comune non deve far salire frammenti a caso.
  index.indexFile(P, 'rumore.md', 'Il treno di sera.\n')
  embedAll(index, [P], () => unit(0, 0, 1))
  assert.ok(!index.search(P, 'attrezzi per assemblare', { queryVector: domanda, model: M }).results.slice(0, 1).some((row) => row.path === 'rumore.md'))
  // Cartella, limite e progetti si rispettano anche con i vettori.
  assert.deepEqual(index.search(P, 'attrezzi', { queryVector: domanda, model: M, folder: 'pane.md' }).results.map((row) => row.path), ['pane.md'])
  assert.equal(index.search(P, 'attrezzi', { queryVector: domanda, model: M, limit: 1 }).results.length, 1)
  assert.deepEqual(index.search('altro', 'attrezzi', { queryVector: domanda, model: M }).results, [])
  // Vettori di un'altra dimensione (modello diverso) vengono ignorati, non fanno cadere la ricerca.
  assert.equal(index.search(P, 'attrezzi', { queryVector: unit(1, 0), model: M }).mode, 'or')
})

test('due modelli convivono: ognuno ha i suoi vettori, passare dall\'uno all\'altro calcola solo ciò che manca', () => {
  const index = memory()
  index.indexFile(P, 'a.md', '# A\n\nIl faro.\n')
  index.indexFile(P, 'b.md', '# B\n\nIl mare.\n')
  embedAll(index, [P], () => unit(1, 0, 0), 'cpu-q8')
  assert.deepEqual(index.embeddingStats([P], 'cpu-q8'), { total: 2, embedded: 2 })
  // La GPU non ha ancora nulla: tutto da calcolare, ma i vettori della CPU restano.
  assert.deepEqual(index.embeddingStats([P], 'gpu-fp16'), { total: 2, embedded: 0 })
  assert.equal(index.pendingEmbeddings([P], 'gpu-fp16', 10).length, 2)
  embedAll(index, [P], () => unit(0, 1, 0), 'gpu-fp16')
  assert.deepEqual(index.embeddingStats([P], 'gpu-fp16'), { total: 2, embedded: 2 })
  // Un frammento nuovo manca a entrambi; chi lo calcola non tocca l'altro.
  index.indexFile(P, 'c.md', '# C\n\nLa nebbia.\n')
  assert.equal(index.pendingEmbeddings([P], 'cpu-q8', 10).length, 1)
  assert.equal(index.pendingEmbeddings([P], 'gpu-fp16', 10).length, 1)
  embedAll(index, [P], () => unit(1, 0, 0), 'cpu-q8')
  assert.equal(index.pendingEmbeddings([P], 'cpu-q8', 10).length, 0)
  assert.equal(index.pendingEmbeddings([P], 'gpu-fp16', 10).length, 1)
  // La ricerca usa solo i vettori del modello chiesto.
  const found = index.search(P, 'zzz', { queryVector: unit(0, 1, 0), model: 'gpu-fp16' })
  assert.equal(found.mode, 'hybrid')
  assert.deepEqual(found.results.map((row) => row.path).sort(), ['a.md', 'b.md'])
  assert.equal(index.search(P, 'zzz', { queryVector: unit(0, 1, 0), model: 'altro-modello' }).mode, 'or')
  // Togliere un modello butta solo i suoi vettori.
  assert.equal(index.clearEmbeddings('gpu-fp16'), 2)
  assert.deepEqual(index.embeddingStats([P], 'cpu-q8'), { total: 3, embedded: 3 })
  assert.equal(index.clearEmbeddings(), 3)
})

test('migrazione dalla versione 2: i vettori già calcolati restano, sotto il modello con cui erano stati fatti', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-migrate-'))
  const file = path.join(directory, 'k.db')
  try {
    // Un database come lo scriveva la versione 2: `embeddings (hash, vector)` e il modello in `meta`.
    const first = createKnowledgeIndex({ file })
    first.indexFile(P, 'a.md', '# A\n\nIl faro segnala la costa.\n')
    const [pending] = first.pendingEmbeddings([P], 'x', 5)
    first.close()
    const { DatabaseSync } = require('node:sqlite')
    const old = new DatabaseSync(file)
    old.exec('drop table embeddings; create table embeddings (hash text primary key, vector blob not null)')
    old.prepare('insert into embeddings(hash, vector) values (?, ?)').run(pending.hash, new Uint8Array(unit(1, 0, 0).buffer))
    old.prepare("insert or replace into meta(key, value) values ('embedding_model', 'vecchio-modello')").run()
    old.prepare("update meta set value = '2' where key = 'schema'").run()
    old.close()
    const index = createKnowledgeIndex({ file })
    assert.deepEqual(index.embeddingStats([P], 'vecchio-modello'), { total: 1, embedded: 1 })
    assert.equal(index.stats(P).files, 1, 'il testo indicizzato non si è perso')
    assert.equal(index.search(P, 'zzz', { queryVector: unit(1, 0, 0), model: 'vecchio-modello' }).mode, 'hybrid')
    index.close()
    // Riaperto, nessuna nuova migrazione né perdite.
    const again = createKnowledgeIndex({ file })
    assert.deepEqual(again.embeddingStats([P], 'vecchio-modello'), { total: 1, embedded: 1 })
    again.close()
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('chunkMarkdown: le immagini incorporate (data:…;base64) non entrano nei frammenti, le righe restano quelle', () => {
  const blob = 'iVBORw0KGgoAAAANSUhEUgAA'.repeat(5000)
  const source = `# Immagini\n\nUn testo breve prima.\n\n[image1]: <data:image/png;base64,${blob}>\n[image2]: <data:image/jpeg;base64,${blob}>\n\nE un testo dopo.\n`
  const chunks = chunkMarkdown(source)
  const total = chunks.reduce((sum, chunk) => sum + chunk.text.length, 0)
  assert.ok(total < 500, `i frammenti pesano ${total} caratteri`)
  assert.ok(chunks.some((chunk) => /data:image\/png;base64,…/.test(chunk.text)))
  // Le righe sono quelle del file originale (il testo dopo sta alla riga 8).
  assert.equal(chunks[chunks.length - 1].endLine, 8)
  // Un indirizzo data: corto (o un testo che gli somiglia) non si tocca.
  assert.match(chunkMarkdown('Vedi data:text/plain;base64,QUJD per un esempio.')[0].text, /QUJD/)
  // Con l'indice, la ricerca non trova più il contenuto binario.
  const index = memory()
  index.indexFile(P, 'img.md', source)
  assert.equal(index.search(P, 'iVBORw0KGgoAAAANSUhEUgAA').results.length, 0)
  assert.equal(index.search(P, 'testo dopo').results.length, 1)
})

// ----- Qualità dei risultati: niente frammenti di soli simboli, parole evidenziate nei titoli, chunker versionato -----
const { syncTree } = require('../electron/knowledge-sync.cjs')
const { markTerms, formatKnowledgeResults } = require('../electron/knowledge-service.cjs')

test('chunkMarkdown: i paragrafi di soli simboli (###, ---, ***) non entrano nei frammenti', () => {
  const chunks = chunkMarkdown('# Titolo\n\n###\n\n---\n\nTesto vero.\n\n***\n')
  assert.deepEqual(chunks.map((chunk) => [chunk.startLine, chunk.endLine, chunk.text]), [[7, 7, 'Testo vero.']])
  assert.equal(chunkMarkdown('# A\n\n###\n').length, 0, 'un documento di soli simboli non produce frammenti')
  assert.equal(chunkMarkdown('```\n###\n```\n').length, 0)
  assert.equal(chunkMarkdown('# A\n\n```\nx = 1\n```\n').length, 1, 'il codice con lettere resta')
  assert.equal(chunkMarkdown('# A\n\n2024\n').length, 1, 'una cifra basta')
})

test('markTerms: evidenzia le parole cercate nel titolo, senza accenti e maiuscole, e il prefisso della parola', () => {
  assert.equal(markTerms('Partito Edonista Italiano › Perché nasce il PEI', 'edonista perche pei'), 'Partito «Edonista» Italiano › «Perché» nasce il «PEI»')
  assert.equal(markTerms('Cosa propone il partito', 'prop'), 'Cosa «propone» il partito')
  assert.equal(markTerms('Niente da evidenziare', 'zzz'), 'Niente da evidenziare')
  assert.equal(markTerms('Titolo', ''), 'Titolo')
  assert.equal(markTerms('Un titolo con a e i', 'a'), 'Un titolo con a e i', 'le parole di una sola lettera non si evidenziano')
  const text = formatKnowledgeResults('edonista', { mode: 'hybrid', results: [{ path: 'a.md', startLine: 1, endLine: 2, heading: 'Il Partito Edonista', snippet: 'testo senza la parola' }] }, { files: 1 })
  assert.match(text, /a\.md:1-2 — Il Partito «Edonista»/)
})

test('un chunker nuovo rilegge i file alla scansione successiva senza ricalcolare i vettori dei frammenti rimasti uguali', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-chunker-'))
  const project = path.join(directory, 'p')
  fs.mkdirSync(project)
  fs.writeFileSync(path.join(project, 'a.md'), '# A\n\nIl faro segnala la costa.\n\n###\n')
  const file = path.join(directory, 'k.db')
  try {
    const first = createKnowledgeIndex({ file })
    await syncTree(first, project, '', new Set())
    // Si simula un indice fatto con un chunker precedente: il frammento di soli simboli c'era, il marcatore di versione no.
    const { DatabaseSync } = require('node:sqlite')
    first.close()
    const old = new DatabaseSync(file)
    old.prepare("insert into chunks(file_id, ord, heading, start_line, end_line, text, hash) select id, 5, 'A', 5, 5, '###', 'junk' from files").run()
    old.prepare("delete from meta where key = 'chunker'").run()
    old.close()
    const index = createKnowledgeIndex({ file })
    index.storeEmbeddings('m', index.pendingEmbeddings([project], 'm', 50).map((item) => ({ hash: item.hash, vector: unit(1, 0, 0) })))
    const before = index.embeddingStats([project], 'm').embedded
    assert.ok(before >= 1)
    // La riapertura ha azzerato data e hash dei file: la scansione li rilegge tutti.
    await syncTree(index, project, '', new Set())
    assert.deepEqual(index.pendingEmbeddings([project], 'm', 50), [], 'i vettori dei frammenti rimasti uguali si riusano')
    assert.equal(index.search(project, 'faro').results.length, 1)
    const { DatabaseSync: Db } = require('node:sqlite')
    index.close()
    const check = new Db(file, { readOnly: true })
    assert.equal(check.prepare("select count(*) as n from chunks where text = '###'").get().n, 0, 'il frammento di soli simboli è sparito')
    assert.equal(check.prepare("select value from meta where key = 'chunker'").get().value, '3')
    check.close()
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('chunkMarkdown: l\'intestazione YAML in testa al file non è testo (e le righe restano quelle); una riga --- a metà no', () => {
  const chunks = chunkMarkdown('---\nurl: https://x.test/a\ntitle: T\nsaved: 2026-11-05\n---\n\n# T\n\nTesto vero.\n')
  assert.deepEqual(chunks.map((chunk) => [chunk.startLine, chunk.endLine, chunk.heading, chunk.text]), [[9, 9, 'T', 'Testo vero.']])
  assert.equal(chunkMarkdown('---\nnon chiusa mai\n\ntesto\n').length, 1, 'un --- iniziale senza chiusura non è un\'intestazione')
  assert.equal(chunkMarkdown('Prima.\n\n---\n\nSeconda.\n').length, 1, 'un --- a metà documento non tocca nulla')
  const index = memory()
  index.indexFile(P, 'web.md', '---\nurl: https://x.test/a\nsaved_by: agent\n---\n\n# Titolo\n\nIl faro.\n')
  assert.equal(index.search(P, 'saved_by').results.length, 0, 'i metadati non si cercano')
  assert.equal(index.search(P, 'faro').results.length, 1)
})

// ----- Pertinenza: un vicino "per significato" conta solo se si stacca dagli altri per quella domanda -----

test('relevantNeighbors: senza abbastanza vettori non si giudica (si tiene tutto), con statistica degenere neppure', () => {
  const items = [{ similarity: 0.8 }, { similarity: 0.79 }]
  assert.equal(relevantNeighbors(items, { population: 10, mean: 0.7, std: 0.02 }, false), items)
  assert.equal(relevantNeighbors(items, { population: 500, mean: 0.7, std: 0 }, false), items)
})

test('relevantNeighbors: una domanda senza risposta (nessun gruppo staccato) non dà nulla; un gruppo staccato sì', () => {
  const stats = { population: 4000, mean: 0.76, std: 0.02 }
  // z = (s - 0,76) / 0,02: un solo caso fortuito sopra z 4 non basta.
  const loneOutlier = [0.85, 0.83, 0.82, 0.81].map((similarity) => ({ similarity }))
  assert.deepEqual(relevantNeighbors(loneOutlier, stats, false), [])
  // Tre sopra z 4 (0,84): il gruppo si stacca, e restano quelli da z 3,5 (0,83). Valori lontani dalle soglie, per non dipendere dagli arrotondamenti.
  const group = [0.90, 0.87, 0.85, 0.835, 0.82].map((similarity) => ({ similarity }))
  const kept = relevantNeighbors(group, stats, false)
  assert.deepEqual(kept.map((item) => item.similarity), [0.90, 0.87, 0.85, 0.835])
  assert.ok(kept.every((item) => item.z >= 3.5))
})

test('relevantNeighbors: il gruppo staccato serve sempre; con parole trovate i vicini si prendono da z 3, senza da z 3,5', () => {
  const stats = { population: 4000, mean: 0.76, std: 0.02 }
  const group = [0.90, 0.87, 0.85, 0.825, 0.80].map((similarity) => ({ similarity }))
  assert.deepEqual(relevantNeighbors(group, stats, true).map((item) => item.similarity), [0.90, 0.87, 0.85, 0.825])
  assert.deepEqual(relevantNeighbors(group, stats, false).map((item) => item.similarity), [0.90, 0.87, 0.85])
  // Una parola trovata per caso non rende pertinenti i "vicini" di una domanda senza gruppo (il caso "Tardigrado").
  const noGroup = [0.85, 0.83, 0.825, 0.82].map((similarity) => ({ similarity }))
  assert.deepEqual(relevantNeighbors(noGroup, stats, true), [])
})

test('buildMatchQuery: in modo "or" le parole funzionali non contano (salvo che la domanda sia fatta solo di quelle)', () => {
  assert.equal(buildMatchQuery('tecniche di sopravvivenza dei tardigradi', 'or'), '"tecniche" OR "sopravvivenza" OR "tardigradi"*')
  assert.equal(buildMatchQuery('tecniche di sopravvivenza', 'and'), '"tecniche" "di" "sopravvivenza"*')
  assert.equal(buildMatchQuery('di della', 'or'), '"di" OR "della"*')
})

test('search: con tanti vettori una domanda senza gruppo staccato non restituisce vicini a caso', () => {
  const index = memory()
  const M = 'm-pertinenza'
  const dims = 8
  const unitN = (values) => { const norm = Math.hypot(...values); return Float32Array.from(values.map((value) => value / norm)) }
  // 80 passaggi con vettori quasi uguali tra loro (rumore piccolo): nessuno si stacca dagli altri per la domanda.
  for (let n = 0; n < 80; n += 1) index.indexFile(P, `f${n}.md`, `# T${n}\n\nTesto numero ${n} senza particolarità.\n`)
  const pending = index.pendingEmbeddings([P], M, 200)
  index.storeEmbeddings(M, pending.map((item, i) => ({ hash: item.hash, vector: unitN(Array.from({ length: dims }, (_, k) => (k === 0 ? 1 : ((i * 7 + k * 13) % 11) / 100))) })))
  const query = unitN([1, 0.05, 0.02, 0.03, 0.01, 0.04, 0.02, 0.01])
  const found = index.search(P, 'tardigrado', { queryVector: query, model: M })
  assert.equal(found.results.length, 0)
  assert.notEqual(found.mode, 'hybrid')
  index.close()
})

test('search: ogni risultato ha somiglianza, z e fattore di pertinenza (anche quello trovato solo dalle parole)', () => {
  const index = memory()
  const M = 'm-fattore'
  const unitN = (values) => { const norm = Math.hypot(...values); return Float32Array.from(values.map((value) => value / norm)) }
  for (let n = 0; n < 80; n += 1) index.indexFile(P, `f${n}.md`, `# T${n}\n\nTesto numero ${n} generico.\n`)
  index.indexFile(P, 'gatti.md', '# Gatti\n\nI gatti dormono molto durante il giorno.\n')
  index.indexFile(P, 'gatti2.md', '# Gatti 2\n\nUn gatto domestico caccia di notte.\n')
  index.indexFile(P, 'gatti3.md', '# Gatti 3\n\nIl gatto fa le fusa quando è contento.\n')
  const pending = index.pendingEmbeddings([P], M, 500)
  const text = new Map(pending.map((item) => [item.hash, item.text]))
  const vector = (item, i) => (/gatt/i.test(text.get(item.hash)) ? unitN([1, 0.05, 0.02, 0, 0, 0, 0, 0]) : unitN([0.2, 1, ((i * 7) % 13) / 30, ((i * 3) % 11) / 30, ((i * 5) % 7) / 30, 0.1, 0.05, 0.02]))
  index.storeEmbeddings(M, pending.map((item, i) => ({ hash: item.hash, vector: vector(item, i) })))
  const found = index.search(P, 'gatto', { queryVector: unitN([1, 0.04, 0.02, 0, 0, 0, 0, 0]), model: M })
  assert.equal(found.mode, 'hybrid')
  assert.ok(found.results.length >= 3)
  for (const row of found.results) {
    assert.ok(Number.isFinite(row.z) && row.relevance >= 0 && row.relevance <= 1, JSON.stringify(row))
  }
  assert.ok(found.results[0].relevance > 0.7, `pertinenza ${found.results[0].relevance}`)
  assert.ok(found.results.every((row) => /gatt/i.test(row.path)), 'solo i passaggi sui gatti')
  index.close()
})

test('search: con includeWeak si aggiungono i meno pertinenti (weak), sempre ordinati per pertinenza; senza, si contano soltanto', () => {
  const index = memory()
  const M = 'm-weak'
  const unitN = (values) => { const norm = Math.hypot(...values); return Float32Array.from(values.map((value) => value / norm)) }
  for (let n = 0; n < 80; n += 1) index.indexFile(P, `f${n}.md`, `# T${n}\n\nTesto numero ${n} generico.\n`)
  for (let n = 1; n <= 3; n += 1) index.indexFile(P, `gatti${n}.md`, `# Gatti ${n}\n\nIl gatto dorme sul divano, ${n} volta al giorno.\n`)
  const pending = index.pendingEmbeddings([P], M, 500)
  const text = new Map(pending.map((item) => [item.hash, item.text]))
  index.storeEmbeddings(M, pending.map((item, i) => ({ hash: item.hash, vector: /gatt/i.test(text.get(item.hash)) ? unitN([1, 0.05, 0.02, 0, 0, 0, 0, 0]) : unitN([0.2, 1, ((i * 7) % 13) / 30, ((i * 3) % 11) / 30, ((i * 5) % 7) / 30, 0.1, 0.05, 0.02]) })))
  const options = { queryVector: unitN([1, 0.04, 0.02, 0, 0, 0, 0, 0]), model: M, limit: 12, maxPerFile: 1 }
  const strict = index.search(P, 'felino', options)
  assert.ok(strict.weakCount > 0, 'ci sono passaggi scartati')
  assert.ok(strict.results.length >= 1 && strict.results.every((row) => !row.weak && /gatti/.test(row.path)))
  const all = index.search(P, 'felino', { ...options, includeWeak: true })
  assert.ok(all.results.length > strict.results.length)
  assert.ok(all.results.some((row) => row.weak === true))
  assert.ok(all.results.filter((row) => !row.weak).every((row) => /gatti/.test(row.path)))
  const relevances = all.results.map((row) => row.relevance)
  assert.deepEqual(relevances, [...relevances].sort((a, b) => b - a), 'ordinati per pertinenza')
  assert.ok(!all.results[0].weak, 'in cima i pertinenti')
  index.close()
})
