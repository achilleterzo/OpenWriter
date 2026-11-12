const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createInstanceRegistry } = require('../electron/instance-registry.cjs')

const samePath = (a, b) => a.toLowerCase() === b.toLowerCase()

test('instance-registry: ogni istanza vede il progetto delle altre, anche con maiuscole diverse; le istanze morte si ignorano e si tolgono', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-instances-'))
  try {
    const alive = (pid) => pid !== 3
    const one = createInstanceRegistry({ directory, samePath, pid: 1, alive })
    const two = createInstanceRegistry({ directory, samePath, pid: 2, alive })
    const dead = createInstanceRegistry({ directory, samePath, pid: 3, alive })
    one.register('D:/Libri/Romanzo')
    two.register(null)
    dead.register('D:/Altro')
    assert.equal(two.holder('d:/libri/romanzo').pid, 1)
    assert.equal(one.holder('D:/Libri/Romanzo'), null, 'una finestra non si conta come altra')
    assert.equal(two.holder('D:/Altro'), null, 'una finestra morta non tiene il progetto')
    assert.equal(fs.existsSync(path.join(directory, '3.json')), false)
    two.register('D:/Altro')
    assert.equal(one.holder('D:/Altro').pid, 2)
    one.unregister()
    assert.equal(two.holder('D:/Libri/Romanzo'), null)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

test('instance-registry: la richiesta di primo piano arriva alla finestra giusta, una volta sola', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-instances-'))
  try {
    const target = createInstanceRegistry({ directory, samePath, pid: 10 })
    const asker = createInstanceRegistry({ directory, samePath, pid: 11 })
    let calls = 0
    const stop = target.watchFocus(() => { calls += 1 }, 10)
    asker.requestFocus(10)
    await new Promise((resolve) => setTimeout(resolve, 80))
    stop()
    assert.equal(calls, 1)
    assert.equal(fs.existsSync(path.join(directory, '10.focus')), false)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
