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
