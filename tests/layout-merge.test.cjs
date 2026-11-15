const test = require('node:test')
const assert = require('node:assert/strict')
const { mergeLayout, LAYOUT_LIMIT } = require('../electron/layout-merge.cjs')
const { createEventBus } = require('../electron/event-bus.cjs')

const parse = (value) => JSON.parse(value)

test('layout-merge: unisce le posizioni a quelle già ricordate, senza buttare le altre', () => {
  const first = mergeLayout(null, [{ id: 'a', x: 10.04, y: -20.06, z: 5 }, { id: 'b', x: 1, y: 2, z: 3 }])
  assert.deepEqual(parse(first), { a: { x: 10, y: -20.1, z: 5 }, b: { x: 1, y: 2, z: 3 } })
  const second = mergeLayout(first, [{ id: 'a', x: 99, y: 98, z: 0 }])
  assert.deepEqual(parse(second).b, { x: 1, y: 2, z: 3 })
  assert.equal(parse(second).a.x, 99)
})

test('layout-merge: due finestre che salvano posizioni diverse non si perdono, in qualunque ordine', () => {
  // Ciascuna manda solo le bolle che ha spostato: il nucleo unisce una alla volta.
  const windowA = [{ id: 'a', x: 1, y: 1, z: 0 }]
  const windowB = [{ id: 'b', x: 2, y: 2, z: 0 }]
  for (const order of [[windowA, windowB], [windowB, windowA]]) {
    let stored = null
    for (const nodes of order) stored = mergeLayout(stored, nodes)
    assert.deepEqual(Object.keys(parse(stored)).sort(), ['a', 'b'])
  }
})

test('layout-merge: dati rovinati, nodi senza coordinate e oltre il limite', () => {
  assert.deepEqual(parse(mergeLayout('{non è json', [{ id: 'a', x: 1, y: 1 }])), { a: { x: 1, y: 1, z: 0 } })
  assert.deepEqual(parse(mergeLayout(JSON.stringify({ a: { x: 'sì', y: 1 }, b: { x: 3, y: 4 }, c: null }), [{ id: 'd', x: NaN, y: 1 }, { x: 1, y: 1 }, null])), { b: { x: 3, y: 4, z: 0 } })
  const many = mergeLayout(null, Array.from({ length: LAYOUT_LIMIT + 5 }, (_, k) => ({ id: `p${k}`, x: k, y: k, z: 0 })))
  const saved = parse(many)
  assert.equal(Object.keys(saved).length, LAYOUT_LIMIT)
  assert.ok(!saved.p0 && saved[`p${LAYOUT_LIMIT + 4}`], 'cadono i più vecchi')
  assert.equal(mergeLayout(null, 'non un elenco'), '{}')
})

test('graphLayoutStore: con un archivio condiviso la fusione è fatta dal nucleo, senza rileggere né riscrivere', async () => {
  const { saveLayout, layoutKeyFor } = await import('../src/lib/graphLayoutStore.js')
  const calls = []
  const storage = { merge: (key, nodes) => calls.push([key, nodes]), getItem: () => { throw new Error('non si rilegge') }, setItem: () => { throw new Error('non si riscrive') } }
  saveLayout([{ id: 'a', x: 1, y: 2, z: 3 }], storage, 'ws1')
  assert.deepEqual(calls, [[layoutKeyFor('ws1'), [{ id: 'a', x: 1, y: 2, z: 3 }]]])
})

test('event-bus: toOthers arriva a tutte le finestre tranne la pagina indicata', () => {
  const bus = createEventBus({ samePath: (a, b) => a === b })
  const make = () => {
    const received = []
    return { received, webContents: { send: (...args) => received.push(args), isDestroyed: () => false }, isDestroyed: () => false, isFocused: () => false, once() {} }
  }
  const one = make()
  const two = make()
  bus.register(one, { project: null })
  bus.register(two, { project: null })
  assert.equal(bus.toOthers(one.webContents, 'preferences:changed', { key: 'k' }), 1)
  assert.deepEqual(one.received, [])
  assert.deepEqual(two.received, [['preferences:changed', { key: 'k' }]])
  assert.equal(bus.toOthers(null, 'x'), 2, 'senza una pagina da escludere, a tutte')
})
