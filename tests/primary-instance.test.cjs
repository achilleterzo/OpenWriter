const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createPrimaryLock } = require('../electron/primary-instance.cjs')

const temp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ow-primary-')), 'primary-instance.lock')

test('primary-instance: la prima istanza è principale, la seconda no; alla chiusura della prima la seconda subentra', () => {
  const file = temp()
  try {
    const log = []
    const alive = (pid) => pid === 1
    const first = createPrimaryLock({ file, pid: 1, alive, onAcquire: () => log.push('1+'), onRelease: () => log.push('1-') })
    const second = createPrimaryLock({ file, pid: 2, alive, onAcquire: () => log.push('2+'), onRelease: () => log.push('2-') })
    assert.equal(first.start(), true)
    assert.equal(second.start(), false)
    assert.equal(second.isPrimary(), false)
    // La principale si chiude: il blocco si libera e la seconda, al controllo successivo, lo prende.
    first.release()
    assert.equal(fs.existsSync(file), false)
    second.check()
    assert.equal(second.isPrimary(), true)
    assert.deepEqual(log, ['1+', '1-', '2+'])
    second.release()
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  }
})

test('primary-instance: se la principale muore senza liberare il blocco (pid inesistente), un\'altra lo prende', () => {
  const file = temp()
  try {
    fs.writeFileSync(file, JSON.stringify({ pid: 99999 }))
    const survivor = createPrimaryLock({ file, pid: 5, alive: () => false })
    assert.equal(survivor.start(), true)
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pid, 5)
    survivor.release()
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  }
})

test('primary-instance: un file di blocco illeggibile è abbandonato; rilasciare non toglie il blocco di un altro', () => {
  const file = temp()
  try {
    fs.writeFileSync(file, 'non json')
    const lock = createPrimaryLock({ file, pid: 7, alive: () => true })
    assert.equal(lock.start(), true)
    const other = createPrimaryLock({ file, pid: 8, alive: () => true })
    assert.equal(other.start(), false)
    other.release()
    assert.equal(fs.existsSync(file), true, 'chi non è proprietario non toglie il blocco')
    lock.release()
  } finally {
    fs.rmSync(path.dirname(file), { recursive: true, force: true })
  }
})
