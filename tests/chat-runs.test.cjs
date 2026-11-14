const test = require('node:test')
const assert = require('node:assert/strict')
const { createEventBus } = require('../electron/event-bus.cjs')
const { createChatRuns } = require('../electron/chat-runs.cjs')

const samePath = (a, b) => a.toLowerCase() === b.toLowerCase()

// Una finestra di prova: la sua pagina registra ciò che riceve e sa dire «distrutta».
function fakeWindow() {
  const received = []
  const handlers = new Map()
  const webContents = {
    send: (...args) => received.push(args),
    isDestroyed: () => false,
    once: (event, handler) => handlers.set(event, handler),
  }
  let closed = null
  return {
    received, webContents,
    isDestroyed: () => false,
    isFocused: () => false,
    once: (event, handler) => { if (event === 'closed') closed = handler },
    destroyPage: () => handlers.get('destroyed')?.(),
    close: () => closed?.(),
  }
}

function setup() {
  const bus = createEventBus({ samePath })
  const one = fakeWindow()
  const two = fakeWindow()
  const other = fakeWindow()
  bus.register(one, { project: 'D:/Libri/A' })
  bus.register(two, { project: 'D:/Libri/A' })
  bus.register(other, { project: 'D:/Libri/B' })
  return { bus, one, two, other, runs: createChatRuns({ events: bus }) }
}
const channels = (window) => window.received.map(([channel]) => channel)

test('chat-runs: chi guida annuncia, le altre finestre dello stesso progetto seguono e le altre no', () => {
  const { runs, one, two, other } = setup()
  assert.equal(runs.start({ sender: one.webContents, project: 'D:/Libri/A', conversationId: 'c1' }), true)
  assert.deepEqual(two.received, [['chat:run-state', { conversationId: 'c1', running: true }]])
  assert.deepEqual(one.received, [], 'chi guida non riceve il proprio annuncio')
  assert.deepEqual(other.received, [], 'un altro progetto non lo vede')

  runs.live({ sender: one.webContents, project: 'd:/libri/a', conversationId: 'c1', live: { text: 'Ciao', thinking: '', status: '' } })
  assert.deepEqual(two.received[1], ['chat:run-live', { conversationId: 'c1', live: { text: 'Ciao', thinking: '', status: '' } }])

  assert.deepEqual(runs.list('D:/Libri/A'), [{ conversationId: 'c1', running: true, live: { text: 'Ciao', thinking: '', status: '' } }], 'chi arriva dopo ritrova il testo')
  assert.deepEqual(runs.list('D:/Libri/B'), [])

  assert.equal(runs.end({ sender: one.webContents, project: 'D:/Libri/A', conversationId: 'c1' }), true)
  assert.deepEqual(two.received[2], ['chat:run-state', { conversationId: 'c1', running: false }])
  assert.deepEqual(runs.list('D:/Libri/A'), [])
})

test('chat-runs: una sola finestra guida una conversazione; le altre non possono mandare il testo né chiudere il lavoro', () => {
  const { runs, one, two } = setup()
  runs.start({ sender: one.webContents, project: 'D:/Libri/A', conversationId: 'c1' })
  assert.equal(runs.start({ sender: two.webContents, project: 'D:/Libri/A', conversationId: 'c1' }), false)
  assert.equal(runs.live({ sender: two.webContents, project: 'D:/Libri/A', conversationId: 'c1', live: { text: 'no' } }), false)
  assert.equal(runs.end({ sender: two.webContents, project: 'D:/Libri/A', conversationId: 'c1' }), false)
  assert.equal(runs.active(), 1)
})

test('chat-runs: fermare un lavoro arriva alla sola finestra che lo guida', () => {
  const { runs, one, two } = setup()
  runs.start({ sender: one.webContents, project: 'D:/Libri/A', conversationId: 'c1' })
  assert.equal(runs.cancel({ project: 'D:/Libri/A', conversationId: 'c1' }), true)
  assert.deepEqual(one.received, [['chat:run-cancel', { conversationId: 'c1' }]])
  assert.ok(!channels(two).includes('chat:run-cancel'))
  assert.equal(runs.cancel({ project: 'D:/Libri/A', conversationId: 'altra' }), false, 'nessun lavoro, nessuna richiesta')
})

test('chat-runs: se la pagina che guida sparisce, il lavoro finisce interrotto per tutti', () => {
  const { runs, one, two } = setup()
  runs.start({ sender: one.webContents, project: 'D:/Libri/A', conversationId: 'c1' })
  one.destroyPage()
  assert.deepEqual(two.received.at(-1), ['chat:run-state', { conversationId: 'c1', running: false, interrupted: true }])
  assert.equal(runs.active(), 0)
})

test('chat-runs: una modifica salvata arriva alle altre finestre dello stesso progetto (la coda con il suo contenuto), non a chi l\'ha fatta', () => {
  const { runs, one, two, other } = setup()
  runs.changed({ sender: one.webContents, project: 'D:/Libri/A', conversationId: 'c1', kind: 'queue', queue: [{ id: 'q1', text: 'poi', now: false }] })
  runs.changed({ sender: one.webContents, project: 'D:/Libri/A', conversationId: 'c1', kind: 'content' })
  assert.deepEqual(two.received, [
    ['chat:changed', { conversationId: 'c1', kind: 'queue', queue: [{ id: 'q1', text: 'poi', now: false }] }],
    ['chat:changed', { conversationId: 'c1', kind: 'content' }],
  ])
  assert.deepEqual(one.received, [])
  assert.deepEqual(other.received, [])
  assert.equal(runs.changed({ sender: one.webContents, project: 'D:/Libri/A', conversationId: '../x', kind: 'content' }), 0, 'un id non valido non viaggia')
})

test('chat-runs: senza progetto le finestre condividono le chat del progetto «main»', () => {
  const bus = createEventBus({ samePath })
  const one = fakeWindow()
  const two = fakeWindow()
  bus.register(one, { project: null })
  bus.register(two, { project: null })
  const runs = createChatRuns({ events: bus })
  runs.start({ sender: one.webContents, project: null, conversationId: 'c9' })
  assert.deepEqual(two.received, [['chat:run-state', { conversationId: 'c9', running: true }]])
})
