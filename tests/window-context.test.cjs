const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createWindowContext } = require('../electron/window-context.cjs')

test('window-context: ogni contesto ha il suo progetto e i suoi archivi, senza condividerli per caso', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-context-'))
  try {
    const main = path.join(root, 'main')
    const projectA = path.join(root, 'A')
    const projectB = path.join(root, 'B')
    for (const directory of [main, projectA, projectB]) fs.mkdirSync(directory, { recursive: true })
    const first = createWindowContext({ mainDirectory: () => main, readDocument: () => '' })
    const second = createWindowContext({ mainDirectory: () => main, readDocument: () => '' })

    assert.equal(first.project, null)
    assert.equal(first.storePath(), main, 'senza progetto gli archivi usano quello main')

    first.project = projectA
    second.project = projectB
    assert.equal(first.storePath(), projectA)
    assert.equal(second.storePath(), projectB)

    const created = first.chatStore.create({ title: 'Solo in A' })
    assert.ok(first.chatStore.list().some((item) => item.id === created.id))
    assert.equal(second.chatStore.list().some((item) => item.id === created.id), false, 'la chat di A non compare in B')
    assert.ok(fs.existsSync(path.join(projectA, '.ow', 'chat', `${created.id}.json`)))

    // Cambiare il progetto vale subito per gli archivi di quel contesto.
    first.project = projectB
    assert.equal(first.chatStore.list().some((item) => item.id === created.id), false)
    first.project = null
    assert.equal(first.storePath(), main)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
