const test = require('node:test')
const assert = require('node:assert/strict')
const { createKnowledgeIndex, isAvailable } = require('../electron/knowledge-index.cjs')
const { affinityEdges, cosine, uniformEdges } = require('../electron/project-graph.cjs')

const unit = (...values) => { const norm = Math.hypot(...values); return Float32Array.from(values.map((value) => value / norm)) }

test('cosine: vettori uguali 1, ortogonali 0, lunghezze diverse 0', () => {
  assert.ok(Math.abs(cosine(unit(1, 2, 3), unit(1, 2, 3)) - 1) < 1e-6)
  assert.equal(cosine(unit(1, 0), unit(0, 1)), 0)
  assert.equal(cosine(unit(1, 0), unit(1, 0, 0)), 0)
  assert.equal(cosine(null, unit(1, 0)), 0)
})

test('affinityEdges: due gruppi di temi si collegano dentro il gruppo, non tra i gruppi', () => {
  const nodes = [
    { id: 'giochi-1', vector: unit(1, 0.1, 0) },
    { id: 'giochi-2', vector: unit(1, 0.2, 0) },
    { id: 'giochi-3', vector: unit(0.9, 0.1, 0.1) },
    { id: 'politica-1', vector: unit(0, 0.1, 1) },
    { id: 'politica-2', vector: unit(0.1, 0, 1) },
  ]
  const edges = affinityEdges(nodes, { perNode: 2 })
  const label = (edge) => [edge.a, edge.b].sort().join('+')
  const names = edges.map(label)
  assert.ok(names.includes('giochi-1+giochi-2'))
  assert.ok(names.includes('politica-1+politica-2'))
  assert.ok(!names.some((name) => /giochi/.test(name) && /politica/.test(name)), names.join(', '))
  assert.ok(edges.every((edge) => edge.weight > 0 && edge.weight <= 1))
  // Una sola volta per coppia.
  assert.equal(new Set(names).size, names.length)
})

test('affinityEdges: ogni progetto ha al massimo `perNode` scelte; i progetti senza vettore restano senza linee', () => {
  const nodes = Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, vector: unit(1, i * 0.05, 0.2) }))
  nodes.push({ id: 'libero', vector: null })
  const edges = affinityEdges(nodes, { perNode: 1 })
  assert.ok(edges.length <= 8)
  assert.ok(edges.every((edge) => edge.a !== 'libero' && edge.b !== 'libero'))
})

test('affinityEdges: due soli progetti si collegano; uno solo o nessun vettore, nessuna linea', () => {
  assert.equal(affinityEdges([{ id: 'a', vector: unit(1, 0) }, { id: 'b', vector: unit(1, 0.1) }]).length, 1)
  assert.deepEqual(affinityEdges([{ id: 'a', vector: unit(1, 0) }]), [])
  assert.deepEqual(affinityEdges([{ id: 'a', vector: null }, { id: 'b', vector: null }]), [])
})

test('uniformEdges: pochi progetti tutti tra loro, molti in anello', () => {
  assert.equal(uniformEdges(['a', 'b', 'c']).length, 3)
  assert.equal(uniformEdges(['a', 'b', 'c', 'd', 'e', 'f', 'g']).length, 7)
  assert.deepEqual(uniformEdges(['a']), [])
})

test('projectCentroids: media normalizzata dei vettori di ogni progetto, solo del modello indicato', { skip: isAvailable() ? false : 'indice non disponibile' }, () => {
  const index = createKnowledgeIndex({ file: ':memory:' })
  try {
    index.indexFile('A', 'uno.md', '# Uno\n\nTesto del primo frammento.\n')
    index.indexFile('A', 'due.md', '# Due\n\nTesto del secondo frammento.\n')
    index.indexFile('B', 'tre.md', '# Tre\n\nTesto del terzo frammento.\n')
    const pending = index.pendingEmbeddings(['A', 'B'], 'm1', 10)
    assert.equal(pending.length, 3)
    // Un vettore per frammento: i due di A puntano su x e y, quello di B su z.
    const vectors = [unit(1, 0, 0), unit(0, 1, 0), unit(0, 0, 1)]
    index.storeEmbeddings('m1', pending.map((item, position) => ({ hash: item.hash, vector: vectors[position] })))
    const result = index.projectCentroids(['A', 'B', 'C'], 'm1')
    assert.deepEqual(Object.keys(result).sort(), ['A', 'B'])
    assert.equal(result.A.count, 2)
    assert.equal(result.B.count, 1)
    for (const entry of Object.values(result)) assert.ok(Math.abs(Math.hypot(...entry.vector) - 1) < 1e-5)
    assert.deepEqual(index.projectCentroids(['A'], 'altro-modello'), {})
  } finally { index.close() }
})

// ----- collectVectors: la media si ricorda solo a vettori finiti -----

const { collectVectors } = require('../electron/project-graph.cjs')

function harness({ complete = {} } = {}) {
  const calls = []
  const centroidsOf = { 'a': unit(1, 0), 'b': unit(0, 1) }
  const cache = new Map()
  const run = (nodes) => collectVectors({
    nodes, model: 'm', cache, key: (path) => path,
    centroids: async (paths) => { calls.push(paths); return Object.fromEntries(paths.filter((p) => centroidsOf[p]).map((p) => [p, { vector: centroidsOf[p] }])) },
    status: async (path) => (path in complete ? { total: 10, embedded: complete[path] } : null),
  })
  return { run, calls, cache }
}
const nodeOf = (path, chunks = 10) => ({ path, chunks, updatedAt: 1 })

test('collectVectors: a vettori finiti la media si ricorda (nessuna richiesta la seconda volta)', async () => {
  const { run, calls, cache } = harness({ complete: { a: 10, b: 10 } })
  const first = await run([nodeOf('a'), nodeOf('b')])
  assert.equal(first.vectors.size, 2)
  assert.equal(first.pending.size, 0)
  assert.equal(cache.size, 2)
  await run([nodeOf('a'), nodeOf('b')])
  assert.equal(calls.length, 1)
})

test('collectVectors: a vettori solo in parte si usa la media provvisoria ma non si ricorda; finiti, si ricalcola', async () => {
  const state = { complete: { a: 10, b: 4 } }
  const { run, calls, cache } = harness(state)
  const first = await run([nodeOf('a'), nodeOf('b')])
  assert.equal(first.vectors.size, 2, 'la media provvisoria si usa')
  assert.deepEqual([...first.pending], ['b'])
  assert.ok(cache.has('a') && !cache.has('b'))
  // Stessa firma (stesso numero di passaggi e stessa data), ma ora i vettori di b sono finiti: va richiesta di nuovo, e allora si ricorda.
  state.complete.b = 10
  const second = await run([nodeOf('a'), nodeOf('b')])
  assert.equal(second.pending.size, 0)
  assert.deepEqual(calls[1], ['b'])
  assert.ok(cache.has('b'))
})

test('collectVectors: un progetto senza vettori è in attesa e non ha vettore; senza modello nulla', async () => {
  const { run, cache } = harness({ complete: { a: 10, c: 0 } })
  const result = await run([nodeOf('a'), nodeOf('c')])
  assert.deepEqual([...result.vectors.keys()], ['a'])
  assert.deepEqual([...result.pending], ['c'])
  assert.ok(!cache.has('c'))
  const none = await collectVectors({ nodes: [nodeOf('a')], model: '', cache: new Map(), key: (p) => p, centroids: async () => ({}), status: async () => null })
  assert.equal(none.vectors.size, 0)
})
