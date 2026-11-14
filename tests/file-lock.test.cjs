const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { withFileLock } = require('../electron/file-lock.cjs')
const { createInstanceRegistry } = require('../electron/instance-registry.cjs')
const { createPrimaryLock } = require('../electron/primary-instance.cjs')
const { createMcpClient } = require('../electron/mcp-client.cjs')

const temp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'ow-lock-'))

test('file-lock: un blocco di un processo morto si riprende, quello di uno vivo no; il blocco si toglie sempre', () => {
  const directory = temp()
  try {
    const file = path.join(directory, 'a.lock')
    fs.writeFileSync(file, JSON.stringify({ pid: 99999 }))
    assert.equal(withFileLock(file, () => 'preso', { pid: 1, alive: () => false }), 'preso')
    assert.equal(fs.existsSync(file), false)

    fs.writeFileSync(file, JSON.stringify({ pid: 2 }))
    let ran = false
    withFileLock(file, () => { ran = true }, { pid: 1, alive: () => true, timeoutMs: 60 })
    assert.equal(ran, true, 'allo scadere del tempo la sezione gira comunque')
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pid, 2, 'e il blocco dell\'altro non si tocca')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('file-lock: un file appena creato e ancora vuoto non è abbandonato', () => {
  const directory = temp()
  try {
    const file = path.join(directory, 'b.lock')
    fs.writeFileSync(file, '')
    let ran = false
    withFileLock(file, () => { ran = true }, { pid: 1, alive: () => true, timeoutMs: 60, staleMs: 10000 })
    assert.equal(ran, true)
    assert.equal(fs.existsSync(file), true, 'non è stato tolto')
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('instance-registry: claim registra il progetto una volta sola, anche con un\'altra grafia del percorso', () => {
  const directory = temp()
  try {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-proj-'))
    const samePath = (a, b) => a.toLowerCase() === b.toLowerCase()
    const one = createInstanceRegistry({ directory, samePath, pid: 1, alive: () => true })
    const two = createInstanceRegistry({ directory, samePath, pid: 2, alive: () => true })
    assert.equal(one.claim(project), null)
    assert.equal(two.claim(path.join(project, '..', path.basename(project)))?.pid, 1)
    assert.equal(fs.existsSync(path.join(directory, '2.json')), false, 'chi non l\'ha ottenuto non registra nulla')
    fs.rmSync(project, { recursive: true, force: true })
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('primary-instance: il file di blocco non è mai visibile vuoto e non restano file di appoggio', () => {
  const directory = temp()
  try {
    const file = path.join(directory, 'primary-instance.lock')
    const lock = createPrimaryLock({ file, pid: 7, alive: () => true })
    assert.equal(lock.start(), true)
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pid, 7)
    assert.deepEqual(fs.readdirSync(directory), ['primary-instance.lock'])
    lock.release()
  } finally { fs.rmSync(directory, { recursive: true, force: true }) }
})

test('mcp-client: un avvio con la vecchia configurazione non si presta a chi ne ha una nuova', async () => {
  const opened = []
  const closed = []
  const sdk = () => ({
    Client: class { constructor() { this.id = opened.length } async connect() { await new Promise((resolve) => setTimeout(resolve, 30)) } async close() { closed.push(this.id) } async listTools() { return { tools: [] } } async callTool() { return { content: [] } } },
    stdio: { StdioClientTransport: class { constructor(options) { opened.push(options.args[0]) } }, getDefaultEnvironment: () => ({}) },
    http: class {},
  })
  const client = createMcpClient({ loadSdkImpl: sdk })
  const entry = (hash) => ({ key: 'k', hash, env: {}, server: { type: 'stdio', command: 'x', args: [hash] } })
  const [old, fresh] = await Promise.all([
    client.listTools(entry('old')).catch(() => null),
    new Promise((resolve) => setTimeout(resolve, 5)).then(() => client.callTool(entry('new'), 't').catch((error) => error)),
  ])
  void old; void fresh
  assert.deepEqual(opened, ['old', 'new'], 'la configurazione nuova ha aperto il suo collegamento')
  assert.equal(client.openConnections(), 1, 'resta solo quello nuovo')
  await client.closeAll()
})
