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

test('createGraphSim: la massa (dati e connessioni) dà volume: i corpi pesanti stanno al centro e si muovono poco, i leggeri si dispongono in profondità e vengono trascinati', async () => {
  const { createGraphSim } = await load()
  const sim = createGraphSim({ seed: 9, wander: false })
  const items = [{ id: 'pesante', r: 40, data: 1 }, ...Array.from({ length: 8 }, (_, k) => ({ id: `leggero${k}`, r: 24, data: 0 }))]
  const links = items.slice(1).map((item) => ({ a: 'pesante', b: item.id, weight: 0.8 }))
  sim.setGraph(items, links, bounds)
  const heavy = sim.get('pesante')
  const light = sim.get('leggero0')
  assert.ok(heavy.mass > light.mass && heavy.inertia > light.inertia, 'più dati e più connessioni, più massa')
  assert.ok(heavy.zSpread < light.zSpread, 'il corpo pesante resta vicino al piano centrale')
  const start = { x: heavy.x, y: heavy.y }
  const lightStart = { x: light.x, y: light.y, z: light.z }
  sim.settle(600, bounds)
  const moved = (node, from) => Math.hypot(node.x - from.x, node.y - from.y)
  assert.ok(Math.abs(heavy.z) < 80, `il pesante sta vicino a z = 0 (${heavy.z})`)
  const depths = sim.nodes.filter((node) => node.id !== 'pesante').map((node) => Math.abs(node.z))
  assert.ok(depths.some((depth) => depth > 40), 'i leggeri hanno profondità: la rete ha volume')
  assert.ok(Number.isFinite(moved(light, lightStart)) && moved(heavy, start) < 400, 'la simulazione resta stabile')
})

test('createGraphSim: una bolla con posizione ricordata parte da lì, anche un satellite, e senza deriva resta ferma', async () => {
  const { createGraphSim } = await load()
  const sim = createGraphSim({ seed: 2, wander: false })
  const items = [
    { id: 'padre', r: 44, at: { x: 100, y: -50, z: 20 } },
    { id: 'figlio', r: 16, parent: 'padre', at: { x: 100, y: 10, z: 20 } },
    { id: 'libero', r: 30, at: { x: -200, y: 120, z: -40 } },
  ]
  sim.setGraph(items, [], bounds)
  assert.deepEqual([sim.get('padre').x, sim.get('padre').y, sim.get('padre').z], [100, -50, 20])
  assert.deepEqual([sim.get('figlio').x, sim.get('figlio').y], [100, 10], 'il satellite non viene rimesso in orbita')
  assert.ok(sim.get('padre').placed && sim.get('figlio').placed)
  const angle = sim.get('figlio').angle
  assert.ok(Math.abs(angle - Math.PI / 2) < 1e-9, 'l\'angolo di partenza è quello in cui si trova')
  const before = sim.nodes.map((node) => [node.x, node.y, node.z])
  for (let k = 0; k < 120; k += 1) sim.step(1 / 60, bounds)
  const moved = sim.nodes.reduce((total, node, index) => total + Math.hypot(node.x - before[index][0], node.y - before[index][1]), 0)
  assert.ok(sim.get('figlio').angle === angle, 'senza deriva i satelliti non girano')
  assert.ok(Number.isFinite(moved))
})

test('createGraphSim: orbit fa girare i satelliti intorno al padre anche a rete ferma, senza muovere gli altri', async () => {
  const { createGraphSim } = await load()
  const sim = createGraphSim({ seed: 4, wander: false })
  sim.setGraph([
    { id: 'padre', r: 44, at: { x: 0, y: 0, z: 10 } },
    { id: 'a', r: 16, parent: 'padre', at: { x: 80, y: 0, z: 10 } },
    { id: 'nipote', r: 10, parent: 'a', at: { x: 110, y: 0, z: 10 } },
    { id: 'libero', r: 30, at: { x: -300, y: 100, z: 0 } },
  ], [], bounds)
  const parent = sim.get('padre')
  const satellite = sim.get('a')
  const grandchild = sim.get('nipote')
  const start = { x: satellite.x, y: satellite.y }
  const free = { x: sim.get('libero').x, y: sim.get('libero').y }
  for (let k = 0; k < 90; k += 1) sim.orbit(1 / 60)
  assert.ok(Math.hypot(satellite.x - start.x, satellite.y - start.y) > 5, 'il satellite gira')
  assert.ok(Math.abs(Math.hypot(satellite.x - parent.x, satellite.y - parent.y) - satellite.orbit) < 1e-6, 'resta sulla sua orbita')
  assert.ok(Math.abs(Math.hypot(grandchild.x - satellite.x, grandchild.y - satellite.y) - grandchild.orbit) < 1e-6, 'il nipote orbita intorno al satellite che si muove')
  assert.equal(satellite.z, parent.z)
  assert.deepEqual([sim.get('libero').x, sim.get('libero').y], [free.x, free.y], 'le altre bolle non si muovono')
  assert.deepEqual([parent.x, parent.y], [0, 0])
})
