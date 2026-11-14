const test = require('node:test')
const assert = require('node:assert/strict')
const { createEventBus } = require('../electron/event-bus.cjs')
const { createDocumentOwners } = require('../electron/document-owners.cjs')

function fakeWindow() {
  const received = []
  const handlers = new Map()
  let focused = 0
  const webContents = { send: (...args) => received.push(args), isDestroyed: () => false, once: (event, handler) => handlers.set(event, handler) }
  return {
    received, webContents,
    isDestroyed: () => false, isFocused: () => false, once() {},
    isMinimized: () => false, show() {}, focus() { focused += 1 },
    focusCount: () => focused,
    destroyPage: () => handlers.get('destroyed')?.(),
  }
}

function setup() {
  const bus = createEventBus({ samePath: (a, b) => a.toLowerCase() === b.toLowerCase() })
  const one = fakeWindow()
  const two = fakeWindow()
  bus.register(one, { project: null })
  bus.register(two, { project: null })
  return { one, two, owners: createDocumentOwners({ events: bus }) }
}
const doc = (name) => require('node:path').resolve('D:/Libri', name)

test('document-owners: il primo che lo vuole lo tiene, l\'altra finestra è rifiutata', () => {
  const { owners, one, two } = setup()
  assert.deepEqual(owners.setHeld({ sender: one.webContents, paths: [doc('a.md'), doc('b.md')] }), { refused: [] })
  assert.deepEqual(owners.setHeld({ sender: two.webContents, paths: [doc('b.md'), doc('c.md')] }), { refused: [doc('b.md')] })
  assert.equal(owners.ownerOf(doc('b.md')), one.webContents)
  assert.equal(owners.ownerOf(doc('c.md')), two.webContents)
})

test('document-owners: lo stesso file con un\'altra grafia è lo stesso documento', () => {
  if (process.platform !== 'win32') return
  const { owners, one, two } = setup()
  owners.setHeld({ sender: one.webContents, paths: ['D:/Libri/Romanzo.md'] })
  assert.deepEqual(owners.setHeld({ sender: two.webContents, paths: ['d:\\libri\\ROMANZO.md'] }).refused.length, 1)
})

test('document-owners: chiudere la scheda libera il documento e lo dice alle altre finestre; la richiesta ripetuta non cambia nulla', () => {
  const { owners, one, two } = setup()
  owners.setHeld({ sender: one.webContents, paths: [doc('a.md')] })
  owners.setHeld({ sender: one.webContents, paths: [doc('a.md')] })
  assert.deepEqual(two.received, [], 'chi non cambia nulla non manda nulla')
  owners.setHeld({ sender: one.webContents, paths: [] })
  assert.deepEqual(two.received, [['documents:released', { path: doc('a.md') }]])
  assert.deepEqual(owners.setHeld({ sender: two.webContents, paths: [doc('a.md')] }), { refused: [] }, 'ora lo prende l\'altra')
})

test('document-owners: se la pagina che lo tiene sparisce, il documento si libera per tutti', () => {
  const { owners, one, two } = setup()
  owners.setHeld({ sender: one.webContents, paths: [doc('a.md')] })
  one.destroyPage()
  assert.equal(owners.count(), 0)
  assert.deepEqual(two.received.at(-1), ['documents:released', { path: doc('a.md') }])
})

test('document-owners: portare avanti chi lo modifica porta avanti la sua finestra e le chiede di mostrare la scheda', () => {
  const { owners, one, two } = setup()
  owners.setHeld({ sender: one.webContents, paths: [doc('a.md')] })
  assert.equal(owners.focusOwner(doc('a.md')), true)
  assert.equal(one.focusCount(), 1)
  assert.deepEqual(one.received, [['documents:reveal', { path: doc('a.md') }]])
  assert.equal(two.focusCount(), 0)
  assert.equal(owners.focusOwner(doc('libero.md')), false)
})

test('document-owners: dati non validi e troppi percorsi non rompono nulla', () => {
  const { owners, one } = setup()
  assert.deepEqual(owners.setHeld({ sender: one.webContents, paths: [null, 5, '', doc('ok.md')] }), { refused: [] })
  assert.equal(owners.count(), 1)
  assert.deepEqual(owners.setHeld({ sender: one.webContents, paths: 'no' }), { refused: [] })
  assert.equal(owners.count(), 0)
  assert.deepEqual(owners.setHeld({ sender: null, paths: [doc('x.md')] }), { refused: [] })
})
