const test = require('node:test')
const assert = require('node:assert/strict')
const { createEventBus } = require('../electron/event-bus.cjs')

// Una finestra di prova: registra ciò che riceve e dice se è in primo piano o distrutta.
function fakeWindow(name, { focused = false } = {}) {
  const received = []
  let destroyed = false
  let closed = null
  const webContents = { send: (...args) => received.push(args), isDestroyed: () => destroyed, hostWebContents: null }
  return {
    name, received, webContents,
    isDestroyed: () => destroyed,
    isFocused: () => focused,
    once: (event, handler) => { if (event === 'closed') closed = handler },
    destroy() { destroyed = true; closed?.() },
    setFocused(value) { focused = value },
  }
}
const samePath = (a, b) => a.toLowerCase() === b.toLowerCase()

test('event-bus: broadcast arriva a tutte le finestre vive, toProject solo a chi mostra quel progetto', () => {
  const bus = createEventBus({ samePath })
  const one = fakeWindow('uno')
  const two = fakeWindow('due')
  bus.register(one, { project: 'D:/Libri/A' })
  bus.register(two, { project: 'D:/Libri/B' })

  assert.equal(bus.broadcast('workspaces:changed'), 2)
  assert.equal(bus.toProject('d:/libri/a', 'workspace:changed', ['x']), 1, 'il confronto dei percorsi è quello dell\'app')
  assert.deepEqual(one.received, [['workspaces:changed'], ['workspace:changed', ['x']]])
  assert.deepEqual(two.received, [['workspaces:changed']])
  assert.equal(bus.toProject(null, 'x'), 0)
})

test('event-bus: toFocused sceglie la finestra in primo piano, altrimenti la prima; una finestra chiusa esce dal bus', () => {
  const bus = createEventBus({ samePath })
  const one = fakeWindow('uno')
  const two = fakeWindow('due', { focused: true })
  bus.register(one, { project: null })
  bus.register(two, { project: null })

  assert.equal(bus.toFocused('app:command', 'settings'), 1)
  assert.equal(two.received.length, 1)
  assert.equal(one.received.length, 0)

  two.setFocused(false)
  bus.toFocused('app:command', 'about')
  assert.equal(one.received.length, 1, 'senza finestra in primo piano, la prima')

  one.destroy()
  assert.equal(bus.count(), 1)
  assert.equal(bus.broadcast('x'), 1)
  two.destroy()
  assert.equal(bus.toFocused('x'), 0, 'senza finestre non si manda nulla e lo si sa')
})

test('event-bus: toContents e toHostOf rispondono alla pagina giusta e ignorano quelle distrutte', () => {
  const bus = createEventBus({ samePath })
  const one = fakeWindow('uno')
  bus.register(one, { project: null })
  const webview = { hostWebContents: one.webContents }
  const orphan = { hostWebContents: null }

  assert.equal(bus.toHostOf(webview, 'browser:pointer-down', 7), 1)
  assert.deepEqual(one.received, [['browser:pointer-down', 7]])
  assert.equal(bus.toHostOf(orphan, 'x'), 0)

  assert.equal(bus.toContents(one.webContents, 'ai:stream', { requestId: 1 }), 1)
  one.destroy()
  assert.equal(bus.toContents(one.webContents, 'ai:stream', {}), 0)
  assert.equal(bus.toContents(null, 'x'), 0)
})

test('event-bus: forProject e windowFor dicono quale finestra è, senza mandare nulla', () => {
  const bus = createEventBus({ samePath })
  const one = fakeWindow('uno')
  const context = { project: 'D:/Libri/A' }
  bus.register(one, context)
  assert.equal(bus.forProject('d:/libri/a').window, one)
  assert.equal(bus.forProject('D:/altro'), null)
  assert.equal(bus.windowFor(one.webContents).context, context)
  assert.equal(one.received.length, 0)
  context.project = 'D:/Libri/B'
  assert.equal(bus.forProject('D:/Libri/A'), null, 'il progetto si rilegge a ogni chiamata')
})
