const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createChatStore } = require('../electron/chat-store.cjs')

test('chat-store: il segno di interruzione e la chiamata senza risultato sopravvivono al salvataggio', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-chat-'))
  try {
    const store = createChatStore({ getProjectPath: () => directory })
    const created = store.create({ title: 'prova', messages: [{ role: 'user', content: 'scrivi' }] })
    const saved = store.save({
      ...created,
      messages: [
        { role: 'user', content: 'scrivi' },
        { role: 'assistant', content: 'parziale\n\n(interrupted)', interrupted: true },
        { role: 'user', content: 'ancora', interrupted: true },
        { role: 'assistant', content: 'chiamo', toolCall: { name: 'replace_text', arguments: { search: 'a' } } },
      ],
    })
    assert.equal(saved.messages[1].interrupted, true)
    assert.equal(saved.messages[2].interrupted, undefined, 'solo le risposte dell\'assistente portano il segno')
    assert.equal(saved.messages[3].toolCall.name, 'replace_text')
    const reread = store.get ? store.get(created.id) : JSON.parse(fs.readFileSync(path.join(directory, '.ow', 'chat', `${created.id}.json`), 'utf8'))
    assert.equal(reread.messages[1].interrupted, true)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('chat-store: la coda dei task si salva a parte e un salvataggio della conversazione, anche con una copia vecchia, non la cancella', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-chat-'))
  try {
    const store = createChatStore({ getProjectPath: () => directory })
    const created = store.create({ title: 'prova', messages: [{ role: 'user', content: 'scrivi' }] })
    store.setQueue(created.id, [{ id: 'a', text: 'poi questo', now: false }, { id: 'b', text: '   ' }, { id: 'c', text: 'e questo', now: true }])
    // Copia vecchia (senza la coda): il salvataggio lascia quella su disco.
    store.save({ ...created, messages: [...created.messages, { role: 'assistant', content: 'fatto' }] })
    const reread = store.get(created.id)
    assert.deepEqual(reread.queue.map((item) => [item.id, item.text, item.now]), [['a', 'poi questo', false], ['c', 'e questo', true]])
    assert.equal(reread.messages.length, 2)
    store.setQueue(created.id, [])
    assert.deepEqual(store.get(created.id).queue, [])
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
