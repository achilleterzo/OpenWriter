const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/lib/textSearch.js')

test('findMatches: testo semplice, maiuscole e parola intera', async () => {
  const { findMatches } = await load()
  const text = 'Gatto gatto gattone, il gatto.'
  assert.equal(findMatches(text, { query: 'gatto' }).matches.length, 4)
  assert.equal(findMatches(text, { query: 'gatto', caseSensitive: true }).matches.length, 3)
  assert.deepEqual(findMatches(text, { query: 'gatto', wholeWord: true }).matches.map((m) => m.from), [0, 6, 24])
  assert.equal(findMatches(text, { query: '' }).matches.length, 0)
  // I caratteri speciali valgono come testo, senza `regex`.
  assert.equal(findMatches('a.b a+b', { query: 'a.b' }).matches.length, 1)
  assert.equal(findMatches('perché sì', { query: 'perché', wholeWord: true }).matches.length, 1, 'le lettere accentate contano come parola')
})

test('findMatches: espressioni regolari, errori e corrispondenze vuote', async () => {
  const { findMatches } = await load()
  assert.equal(findMatches('a1 b22 c333', { query: '\\d+', regex: true }).matches.length, 3)
  const broken = findMatches('x', { query: '(', regex: true })
  assert.ok(broken.error && broken.matches.length === 0)
  assert.equal(findMatches('bbb', { query: 'a*', regex: true }).matches.length, 0, 'una corrispondenza vuota si salta')
  assert.equal(findMatches('riga1\nriga2', { query: '^riga\\d$', regex: true }).matches.length, 2, '^ e $ valgono per riga')
})

test('findMatches: oltre il limite si ferma e lo dice', async () => {
  const { findMatches, MAX_MATCHES } = await load()
  const result = findMatches('a'.repeat(MAX_MATCHES + 10), { query: 'a' })
  assert.equal(result.matches.length, MAX_MATCHES)
  assert.equal(result.truncated, true)
})

test('replaceOne e replaceAll: letterali e con gruppi', async () => {
  const { findMatches, replaceOne, replaceAll } = await load()
  const text = 'uno due uno'
  const { matches } = findMatches(text, { query: 'uno' })
  assert.deepEqual(replaceOne(text, matches[0], 'tre'), { text: 'tre due uno', caret: 3 })
  assert.deepEqual(replaceAll(text, matches, 'zero'), { text: 'zero due zero', count: 2 })
  // Letterale: $1 non si espande senza regex.
  assert.equal(replaceAll(text, matches, '$1').text, '$1 due $1')
  const grouped = findMatches('2026-11-07', { query: '(\\d+)-(\\d+)-(\\d+)', regex: true })
  assert.equal(replaceAll('2026-11-07', grouped.matches, '$3/$2/$1').text, '07/11/2026')
  const named = findMatches('chiave=valore', { query: '(?<k>\\w+)=(?<v>\\w+)', regex: true })
  assert.equal(replaceAll('chiave=valore', named.matches, '$<v>=$<k> ($&) $$').text, 'valore=chiave (chiave=valore) $')
})

test('lineStarts e lineOf', async () => {
  const { lineStarts, lineOf } = await load()
  const starts = lineStarts('ab\ncd\n\nef')
  assert.deepEqual(starts, [0, 3, 6, 7])
  assert.deepEqual([0, 2, 3, 5, 6, 7, 8].map((position) => lineOf(starts, position)), [0, 0, 1, 1, 2, 3, 3])
})
