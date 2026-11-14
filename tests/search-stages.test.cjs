const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/lib/searchStages.js')
const hit = (project, file, startLine = 1) => ({ project, file, startLine })

test('searchStages: uno stadio che toglie passaggi già mostrati non si applica', async () => {
  const { keepsHits } = await load()
  const shown = [hit('A', 'x.md'), hit('B', 'y.md', 4)]
  // Le sole parole trovano meno di ciò che c'era (i passaggi per sinonimo sono spariti): non si mostra.
  assert.equal(keepsHits(shown, [hit('A', 'x.md')]), false)
  assert.equal(keepsHits(shown, []), false, 'un elenco vuoto non sostituisce quello mostrato')
})

test('searchStages: uno stadio che aggiunge (o riordina) si applica', async () => {
  const { keepsHits } = await load()
  const shown = [hit('A', 'x.md'), hit('B', 'y.md', 4)]
  assert.equal(keepsHits(shown, [hit('B', 'y.md', 4), hit('C', 'z.md'), hit('A', 'x.md')]), true)
  assert.equal(keepsHits(shown, shown), true)
})

test('searchStages: senza nulla di mostrato ogni stadio si applica, e lo stesso file in un altro punto è un altro passaggio', async () => {
  const { keepsHits } = await load()
  assert.equal(keepsHits([], [hit('A', 'x.md')]), true)
  assert.equal(keepsHits(null, []), true)
  assert.equal(keepsHits([hit('A', 'x.md', 1)], [hit('A', 'x.md', 9)]), false)
})
