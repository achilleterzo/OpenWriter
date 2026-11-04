const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createKnowledgeIndex, chunkMarkdown, buildMatchQuery, SCHEMA_VERSION } = require('../electron/knowledge-index.cjs')

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
const unit = (...values) => { const norm = Math.hypot(...values); return new Float32Array(values.map((value) => value / norm)) }
// Dà a ogni frammento in sospeso il vettore scelto da `pick(testo)`.
function embedAll(index, projects, pick) {
  const pending = index.pendingEmbeddings(projects, 100)
  index.storeEmbeddings(pending.map((item) => ({ hash: item.hash, vector: pick(item.text) })))
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
  assert.deepEqual(index.embeddingStats([P]), { total: 2, embedded: 0 })
  assert.equal(embedAll(index, [P], () => unit(1, 0, 0)), 2)
  assert.deepEqual(index.embeddingStats([P]), { total: 2, embedded: 2 })
  assert.equal(index.pendingEmbeddings([P], 10).length, 0)
  // Un file riscritto uguale non ricalcola nulla; uno cambiato ricalcola solo il suo frammento.
  index.indexFile(P, 'a.md', '# A\n\nIl faro segnala la costa.\n', { mtimeMs: 5 })
  assert.equal(index.pendingEmbeddings([P], 10).length, 0)
  index.indexFile(P, 'a.md', '# A\n\nIl faro segnala gli scogli.\n')
  assert.equal(index.pendingEmbeddings([P], 10).length, 1)
  embedAll(index, [P], () => unit(0, 1, 0))
  assert.equal(index.pruneEmbeddings(), 1) // il vettore del vecchio testo di a.md
  assert.deepEqual(index.embeddingStats([P]), { total: 2, embedded: 2 })
  // Solo i progetti chiesti: gli altri non si calcolano.
  index.indexFile('altro', 'x.md', 'Un testo di un altro progetto.')
  assert.equal(index.pendingEmbeddings([P], 10).length, 0)
  assert.equal(index.pendingEmbeddings(['altro'], 10).length, 1)
  assert.equal(index.pendingEmbeddings([], 10).length, 0)
  assert.equal(embeddingText('A › B', 'testo'), 'A › B\ntesto')
})

test('ricerca ibrida: il significato trova ciò che le parole non trovano; senza vettore la ricerca resta per parole', () => {
  const index = memory()
  index.indexFile(P, 'mobile.md', '# Montaggio\n\nServe un cacciavite a croce.\n')
  index.indexFile(P, 'pane.md', '# Ricetta\n\nFarina, acqua e lievito.\n')
  embedAll(index, [P], (text) => (/cacciavite/.test(text) ? unit(1, 0.2, 0) : unit(0, 0.2, 1)))
  const domanda = unit(1, 0.1, 0) // "attrezzi per assemblare": nessuna parola in comune
  assert.equal(index.search(P, 'attrezzi per assemblare').results.length, 0)
  const ibrida = index.search(P, 'attrezzi per assemblare', { queryVector: domanda })
  assert.equal(ibrida.mode, 'hybrid')
  assert.equal(ibrida.results[0].path, 'mobile.md')
  assert.match(ibrida.results[0].snippet, /cacciavite/)
  assert.equal(ibrida.results[0].via, 'meaning')
  // Una parola presente e il significato concordi: il frammento è 'both' e conserva l'evidenziazione.
  const entrambi = index.search(P, 'cacciavite', { queryVector: domanda })
  assert.equal(entrambi.results[0].path, 'mobile.md')
  assert.equal(entrambi.results[0].via, 'both')
  assert.match(entrambi.results[0].snippet, /«cacciavite»/)
  // In ibrida "almeno una parola" non entra: una parola comune non deve far salire frammenti a caso.
  index.indexFile(P, 'rumore.md', 'Il treno di sera.\n')
  embedAll(index, [P], () => unit(0, 0, 1))
  assert.ok(!index.search(P, 'attrezzi per assemblare', { queryVector: domanda }).results.slice(0, 1).some((row) => row.path === 'rumore.md'))
  // Cartella, limite e progetti si rispettano anche con i vettori.
  assert.deepEqual(index.search(P, 'attrezzi', { queryVector: domanda, folder: 'pane.md' }).results.map((row) => row.path), ['pane.md'])
  assert.equal(index.search(P, 'attrezzi', { queryVector: domanda, limit: 1 }).results.length, 1)
  assert.deepEqual(index.search('altro', 'attrezzi', { queryVector: domanda }).results, [])
  // Vettori di un'altra dimensione (modello diverso) vengono ignorati, non fanno cadere la ricerca.
  assert.equal(index.search(P, 'attrezzi', { queryVector: unit(1, 0) }).mode, 'or')
})

test('cambiare modello butta i vettori; senza vettori la ricerca ibrida ricade sulle parole', () => {
  const index = memory()
  index.indexFile(P, 'a.md', 'Il faro.\n')
  assert.equal(index.useEmbeddingModel('m1'), true)
  assert.equal(index.useEmbeddingModel('m1'), false)
  embedAll(index, [P], () => unit(1, 0, 0))
  assert.equal(index.embeddingStats([P]).embedded, 1)
  assert.equal(index.useEmbeddingModel('m2'), true)
  assert.equal(index.embeddingStats([P]).embedded, 0)
  assert.equal(index.search(P, 'faro', { queryVector: unit(1, 0, 0) }).mode, 'and')
  embedAll(index, [P], () => unit(1, 0, 0))
  assert.equal(index.clearEmbeddings(), 1)
})
