const test = require('node:test')
const assert = require('node:assert/strict')

const load = () => import('../src/lib/graphLayoutStore.js')
const memory = () => { const data = new Map(); return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key) } }

test('graphLayoutStore: salva, rilegge e dimentica le posizioni', async () => {
  const { loadLayout, saveLayout, clearLayout } = await load()
  const storage = memory()
  assert.deepEqual(loadLayout(storage), {})
  saveLayout([{ id: 'a', x: 10.04, y: -20.06, z: 5 }, { id: 'b', x: 1, y: 2, z: 3 }], storage)
  assert.deepEqual(loadLayout(storage), { a: { x: 10, y: -20.1, z: 5 }, b: { x: 1, y: 2, z: 3 } })
  // Si uniscono, non si sostituiscono: i progetti non più visibili ora (un disco scollegato) tengono il loro posto.
  saveLayout([{ id: 'a', x: 99, y: 98, z: 0 }], storage)
  assert.deepEqual(loadLayout(storage).b, { x: 1, y: 2, z: 3 })
  assert.equal(loadLayout(storage).a.x, 99)
  clearLayout(storage)
  assert.deepEqual(loadLayout(storage), {})
})

test('graphLayoutStore: dati rovinati o archivio mancante non rompono nulla', async () => {
  const { loadLayout, saveLayout, LAYOUT_KEY } = await load()
  const storage = memory()
  storage.setItem(LAYOUT_KEY, '{non è json')
  assert.deepEqual(loadLayout(storage), {})
  storage.setItem(LAYOUT_KEY, JSON.stringify({ a: { x: 'sì', y: 1 }, b: { x: 3, y: 4 }, c: null }))
  assert.deepEqual(loadLayout(storage), { b: { x: 3, y: 4, z: 0 } })
  assert.deepEqual(loadLayout(null), {})
  assert.doesNotThrow(() => saveLayout([{ id: 'a', x: 1, y: 1, z: 1 }], null))
  assert.doesNotThrow(() => saveLayout([{ id: 'a', x: NaN, y: 1 }], storage))
})

test('graphLayoutStore: oltre il limite cadono i più vecchi', async () => {
  const { loadLayout, saveLayout, LAYOUT_LIMIT } = await load()
  const storage = memory()
  saveLayout(Array.from({ length: LAYOUT_LIMIT + 5 }, (_, k) => ({ id: `p${k}`, x: k, y: k, z: 0 })), storage)
  const saved = loadLayout(storage)
  assert.equal(Object.keys(saved).length, LAYOUT_LIMIT)
  assert.ok(!saved.p0 && saved[`p${LAYOUT_LIMIT + 4}`])
})
