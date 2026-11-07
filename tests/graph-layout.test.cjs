const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/lib/graphLayout.js')
const bounds = { width: 1000, height: 700 }

test('createGraphSim: le bolle connesse si avvicinano, quelle libere restano dentro lo spazio e si muovono', async () => {
  const { createGraphSim } = await load()
  const sim = createGraphSim({ seed: 3 })
  const items = ['a', 'b', 'c', 'd', 'libero1', 'libero2'].map((id) => ({ id, r: 30 }))
  sim.setGraph(items, [{ a: 'a', b: 'b', weight: 1 }, { a: 'b', b: 'c', weight: 0.8 }, { a: 'c', b: 'd', weight: 0.6 }], bounds)
  sim.settle(600, bounds)
  const distance = (x, y) => Math.hypot(sim.get(x).x - sim.get(y).x, sim.get(x).y - sim.get(y).y)
  assert.ok(distance('a', 'b') < 260, `a-b ${distance('a', 'b')}`)
  assert.ok(distance('a', 'b') > 60, 'le bolle non si sovrappongono')
  for (const node of sim.nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y))
    assert.ok(Math.abs(node.x) <= 500 && Math.abs(node.y) <= 350, `${node.id} fuori: ${node.x},${node.y}`)
  }
  const before = { x: sim.get('libero1').x, y: sim.get('libero1').y }
  sim.settle(300, bounds)
  assert.ok(Math.hypot(sim.get('libero1').x - before.x, sim.get('libero1').y - before.y) > 1, 'la bolla libera galleggia')
})

test('createGraphSim: da ferma la simulazione non si muove; una bolla fissata non si sposta', async () => {
  const { createGraphSim } = await load()
  const sim = createGraphSim({ seed: 5, wander: false })
  sim.setGraph([{ id: 'x', r: 30 }, { id: 'y', r: 30 }], [], bounds)
  sim.settle(900, bounds)
  sim.freeze()
  const rest = { x: sim.get('x').x, y: sim.get('x').y }
  sim.settle(120, bounds)
  assert.ok(Math.hypot(sim.get('x').x - rest.x, sim.get('x').y - rest.y) < 1e-9)
  sim.freeze(false)
  sim.pin('x', 100, 50)
  sim.settle(60, bounds)
  assert.deepEqual([sim.get('x').x, sim.get('x').y], [100, 50])
  sim.release('x')
  assert.equal(sim.get('x').pinned, false)
})

test('createGraphSim: setGraph conserva le posizioni delle bolle già presenti e scarta i collegamenti a bolle sconosciute', async () => {
  const { createGraphSim } = await load()
  const sim = createGraphSim({ seed: 1 })
  sim.setGraph([{ id: 'a', r: 30 }, { id: 'b', r: 30 }], [], bounds)
  const { x, y } = sim.get('a')
  sim.setGraph([{ id: 'a', r: 40 }, { id: 'c', r: 30 }], [{ a: 'a', b: 'zzz', weight: 1 }, { a: 'a', b: 'c', weight: 1 }], bounds)
  assert.equal(sim.get('a').x, x)
  assert.equal(sim.get('a').y, y)
  assert.equal(sim.get('a').r, 40)
  assert.equal(sim.edges.length, 1)
  assert.equal(sim.get('b'), null)
})

test('createGraphSim: nodeAt trova la bolla sotto il puntatore', async () => {
  const { createGraphSim } = await load()
  const sim = createGraphSim({ seed: 2 })
  sim.setGraph([{ id: 'a', r: 30 }], [], bounds)
  sim.pin('a', 10, 20)
  assert.equal(sim.nodeAt(15, 25)?.id, 'a')
  assert.equal(sim.nodeAt(200, 200), null)
})

test('createGraphSim: un sotto-progetto è un satellite che gira intorno al padre senza sovrapporsi', async () => {
  const { createGraphSim } = await load()
  const sim = createGraphSim({ seed: 9 })
  const items = [{ id: 'padre', r: 44 }, { id: 'a', r: 16, parent: 'padre' }, { id: 'b', r: 16, parent: 'padre' }, { id: 'altro', r: 30 }, { id: 'nipote', r: 12, parent: 'a' }]
  sim.setGraph(items, [{ a: 'padre', b: 'altro', weight: 0.7 }], bounds)
  sim.settle(600, bounds)
  const gap = (x, y) => Math.hypot(sim.get(x).x - sim.get(y).x, sim.get(x).y - sim.get(y).y)
  for (const id of ['a', 'b']) {
    const wanted = sim.get(id).orbit
    assert.ok(Math.abs(gap(id, 'padre') - wanted) < 14, `${id} a ${gap(id, 'padre')} dal padre, orbita ${wanted}`)
    assert.ok(gap(id, 'padre') > 44 + 16, `${id} non si sovrappone al padre`)
  }
  assert.ok(Math.abs(gap('nipote', 'a') - sim.get('nipote').orbit) < 14, 'il sotto-progetto di un sotto-progetto orbita intorno a quest\'ultimo')
  // Girano: dopo un po' la posizione rispetto al padre è cambiata.
  const before = { x: sim.get('a').x - sim.get('padre').x, y: sim.get('a').y - sim.get('padre').y }
  sim.settle(300, bounds)
  assert.ok(Math.hypot(sim.get('a').x - sim.get('padre').x - before.x, sim.get('a').y - sim.get('padre').y - before.y) > 5, 'il satellite gira')
  // Un padre inesistente o un giro (a dentro b dentro a) non rompe nulla: le bolle restano libere.
  const loose = createGraphSim({ seed: 1 })
  loose.setGraph([{ id: 'x', r: 20, parent: 'y' }, { id: 'y', r: 20, parent: 'x' }, { id: 'z', r: 20, parent: 'non-esiste' }], [], bounds)
  loose.settle(60, bounds)
  assert.ok(loose.nodes.every((node) => !node.parent && Number.isFinite(node.x)))
})
