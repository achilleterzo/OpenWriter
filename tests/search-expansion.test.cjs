const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeSearches, cleanTerms } = require('../electron/search-merge.cjs')

const loadExpansion = () => import('../src/lib/queryExpansion.js')

test('parseExpansion: una lista JSON, anche dentro testo o blocchi di codice', async () => {
  const { parseExpansion } = await loadExpansion()
  assert.deepEqual(parseExpansion('["aggressivo", "violento", "brutale"]', 'feroce'), ['aggressivo', 'violento', 'brutale'])
  assert.deepEqual(parseExpansion('Ecco:\n```json\n["aggressivo", "violento"]\n```', 'feroce'), ['aggressivo', 'violento'])
  assert.deepEqual(parseExpansion('<think>ragiono…</think>["crudele"]', 'feroce'), ['crudele'])
})

test('parseExpansion: formato libero (righe, virgole, elenchi), senza doppioni, senza la domanda e senza frasi', async () => {
  const { parseExpansion, MAX_TERMS } = await loadExpansion()
  assert.deepEqual(parseExpansion('1. aggressivo\n2. violento\n- brutale\n* “crudele”', 'feroce'), ['aggressivo', 'violento', 'brutale', 'crudele'])
  assert.deepEqual(parseExpansion('aggressivo, Violento, violento, FEROCE, è un termine che indica molta aggressività, feroce', 'Feroce'), ['aggressivo', 'Violento'])
  assert.deepEqual(parseExpansion('perché', 'perche'), [])
  const many = JSON.stringify(Array.from({ length: 30 }, (_, i) => `termine${i}`))
  assert.equal(parseExpansion(many, 'x').length, MAX_TERMS)
  assert.deepEqual(parseExpansion('', 'x'), [])
  assert.deepEqual(parseExpansion(null, 'x'), [])
})

test('expansionMessages: il modello vede solo la domanda, e deve rispondere con una lista JSON', async () => {
  const { expansionMessages } = await loadExpansion()
  const messages = expansionMessages('  feroce ')
  assert.equal(messages.length, 2)
  assert.equal(messages[1].content, 'feroce')
  assert.match(messages[0].content, /JSON array/)
})

const hit = (file, startLine, relevance, extra = {}) => ({ project: 'D:/p', file, startLine, relevance, ...extra })

test('mergeSearches: un passaggio trovato da più termini compare una volta, con il termine che lo valorizza di più; ordine per pertinenza', () => {
  const merged = mergeSearches([
    { term: 'feroce', original: true, results: [hit('a.md', 1, 0.3), hit('b.md', 5, 0.2)] },
    { term: 'aggressivo', original: false, results: [hit('a.md', 1, 0.6), hit('c.md', 9, 0.9)] },
    { term: 'violento', original: false, results: [hit('b.md', 5, 0.2), hit('d.md', 2, undefined)] },
  ])
  assert.deepEqual(merged.map((row) => [row.file, row.term]), [['c.md', 'aggressivo'], ['a.md', 'aggressivo'], ['b.md', 'feroce'], ['d.md', 'violento']])
  assert.ok(merged.every((row) => !('original' in row) && !('order' in row)))
})

test('mergeSearches: a pari pertinenza vince la domanda; il limite taglia; progetti con maiuscole diverse sono lo stesso', () => {
  const merged = mergeSearches([
    { term: 'q', original: true, results: [hit('a.md', 1, 0.5, { project: 'D:/P' })] },
    { term: 's', original: false, results: [hit('a.md', 1, 0.5, { project: 'd:/p' }), hit('x.md', 1, 0.4), hit('y.md', 1, 0.3)] },
  ], { limit: 2 })
  assert.equal(merged.length, 2)
  assert.deepEqual([merged[0].file, merged[0].term], ['a.md', 'q'])
})

test('cleanTerms: puliti, senza doppioni né la domanda (anche con accenti diversi), al più max', () => {
  assert.deepEqual(cleanTerms([' aggressivo ', 'Aggressivo', 'feroce', 'perché', '', null, 'violento'], 'Feroce'), ['aggressivo', 'perché', 'violento'])
  assert.deepEqual(cleanTerms(['perche', 'a'], 'perché'), ['a'])
  assert.equal(cleanTerms(Array.from({ length: 20 }, (_, i) => `t${i}`), 'x', 5).length, 5)
  assert.deepEqual(cleanTerms('non una lista', 'x'), [])
})

// ----- Cache dei sinonimi -----

const memoryStorage = () => { let text = null; return { read: () => text, write: (value) => { text = value }, peek: () => text } }

test('synonymCache: la stessa domanda (maiuscole, accenti, spazi) con lo stesso modello si ricorda; con un altro modello no', async () => {
  const { createSynonymCache, synonymKey } = await import('../src/lib/synonymCache.js')
  const storage = memoryStorage()
  const cache = createSynonymCache(storage)
  cache.set(synonymKey('Feroce ', 'ollama:x'), ['aggressivo', 'violento'])
  assert.deepEqual(cache.get(synonymKey('  feroce', 'ollama:x')), ['aggressivo', 'violento'])
  assert.deepEqual(cache.get(synonymKey('FERÒCE', 'ollama:x')), ['aggressivo', 'violento'], 'gli accenti non contano')
  assert.equal(synonymKey('Perché', 'm'), synonymKey('perche', 'm'))
  assert.equal(cache.get(synonymKey('feroce', 'altro-modello')), null)
  // Sopravvive a una nuova istanza (nuova sessione): sta nel testo salvato.
  assert.deepEqual(createSynonymCache(storage).get(synonymKey('feroce', 'ollama:x')), ['aggressivo', 'violento'])
})

test('synonymCache: una risposta vuota non si ricorda; il testo rotto riparte da zero senza errori', async () => {
  const { createSynonymCache } = await import('../src/lib/synonymCache.js')
  const storage = memoryStorage()
  const cache = createSynonymCache(storage)
  cache.set('k', [])
  assert.equal(storage.peek(), null)
  storage.write('{non json')
  assert.equal(cache.get('k'), null)
  cache.set('k', ['a'])
  assert.deepEqual(cache.get('k'), ['a'])
})

test('synonymCache: scade dopo il tempo limite e il numero di voci è limitato (si scartano quelle usate da più tempo)', async () => {
  const { createSynonymCache } = await import('../src/lib/synonymCache.js')
  const storage = memoryStorage()
  let clock = 1000
  const cache = createSynonymCache({ ...storage, now: () => clock, ttlMs: 100, max: 3 })
  cache.set('a', ['1'])
  clock += 50
  assert.deepEqual(cache.get('a'), ['1'])
  clock += 60 // 110 dalla scrittura: scaduta (conta quando è stata scritta, non usata)
  assert.equal(cache.get('a'), null)
  for (const key of ['b', 'c', 'd']) { clock += 1; cache.set(key, [key]) }
  clock += 1
  assert.deepEqual(cache.get('b'), ['b']) // 'b' è stata usata di recente: resta
  clock += 1
  cache.set('e', ['e']) // quarta voce: esce la meno usata, 'c'
  assert.equal(cache.size, 3)
  assert.equal(cache.get('c'), null)
  assert.deepEqual(cache.get('b'), ['b'])
  assert.deepEqual(cache.get('e'), ['e'])
})
