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
