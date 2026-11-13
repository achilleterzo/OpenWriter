const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createMcpServersStore } = require('../electron/mcp-servers-store.cjs')
const { createMcpClient } = require('../electron/mcp-client.cjs')
const { createMcpService, toolName, MAX_RESULT_CHARS } = require('../electron/mcp-service.cjs')

// "Cifratura" di prova: reversibile, non in chiaro nel file.
const secrets = { available: () => true, encrypt: (text) => Buffer.from(text, 'utf8').reverse().toString('base64'), decrypt: (value) => Buffer.from(value, 'base64').reverse().toString('utf8') }
const fake = path.join(__dirname, 'fixtures', 'fake-mcp-server.cjs')

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-mcp-'))
  const data = path.join(root, 'data')
  const parent = path.join(root, 'parent')
  const project = path.join(parent, 'child')
  fs.mkdirSync(path.join(project, '.ow'), { recursive: true })
  fs.mkdirSync(path.join(parent, '.ow'), { recursive: true })
  const store = createMcpServersStore({ directory: data, secrets, getChain: (dir) => (path.resolve(dir) === path.resolve(project) ? [parent, project] : [dir]) })
  return { root, data, parent, project, store }
}
const stdio = (extra = {}) => ({ name: 'Fake', type: 'stdio', command: process.execPath, args: [fake], ...extra })

test('mcp: configurazione non valida o con comando mancante si rifiuta; i nomi delle credenziali si ripuliscono', () => {
  const { store } = setup()
  assert.throws(() => store.save({ server: { name: '', type: 'stdio', command: 'x' } }))
  assert.throws(() => store.save({ server: { name: 'a', type: 'stdio', command: '' } }))
  assert.throws(() => store.save({ server: { name: 'a', type: 'http', url: 'ftp://x' } }))
  const saved = store.save({ server: stdio({ envNames: ['OK_1', '1bad', 'a b'] }), credentials: { env: { OK_1: 'v' } } })
  assert.deepEqual(saved.envNames, ['OK_1'])
})

test('mcp: le credenziali stanno cifrate fuori dalla configurazione, anche per un server di progetto', () => {
  const { store, data, project } = setup()
  store.save({ project, server: stdio(), credentials: { env: { FAKE_TOKEN: 'super-secret' } } })
  assert.ok(!fs.readFileSync(path.join(project, '.ow', 'mcp.json'), 'utf8').includes('super-secret'), 'il progetto non ha la credenziale')
  assert.ok(!fs.readFileSync(path.join(data, 'mcp-secrets.json'), 'utf8').includes('super-secret'), 'il file dei segreti è cifrato')
  assert.deepEqual(store.list(project).project[0].envNames, ['FAKE_TOKEN'])
  assert.equal(store.list(project).project[0].missingCredentials, false)
})

test('mcp: un server di progetto non è usabile finché non si conferma, e si richiede se cambia', () => {
  const { store, project } = setup()
  const saved = store.save({ project, server: stdio() })
  assert.equal(store.active(project)[0].state, 'untrusted')
  store.trust(project, saved.id)
  assert.equal(store.active(project)[0].state, 'ready')
  store.save({ project, server: { ...stdio(), id: saved.id, args: [fake, '--other'] } })
  assert.equal(store.active(project)[0].state, 'untrusted', 'comando cambiato: serve una nuova conferma')
  store.trust(project, saved.id)
  store.save({ project, server: { ...stdio(), id: saved.id, args: [fake, '--other'], alwaysAsk: true } })
  assert.equal(store.active(project)[0].state, 'ready', 'cambiare solo la richiesta di conferma non toglie la fiducia')
})

test('mcp: un progetto copiato senza le credenziali si apre e il server risulta "credenziali mancanti"', () => {
  const { store, data, project } = setup()
  const saved = store.save({ project, server: stdio(), credentials: { env: { FAKE_TOKEN: 'x' } } })
  store.trust(project, saved.id)
  fs.rmSync(path.join(data, 'mcp-secrets.json'))
  assert.equal(store.active(project)[0].state, 'missing-credentials')
})

test('mcp: un sotto-progetto eredita i server del padre; sul nome uguale vince il più vicino', () => {
  const { store, parent, project } = setup()
  store.save({ project: parent, server: stdio({ name: 'Docs' }) })
  store.save({ project: parent, server: stdio({ name: 'Wiki' }) })
  store.save({ project, server: stdio({ name: 'docs', args: [fake, 'child'] }) })
  const list = store.list(project).project
  assert.equal(list.length, 2)
  assert.equal(list.find((server) => server.name.toLowerCase() === 'docs').origin, project)
  assert.equal(list.find((server) => server.name === 'Wiki').inherited, true)
})

test('mcp: ogni progetto sceglie quali server globali usare', () => {
  const { store, project } = setup()
  const one = store.save({ server: stdio({ name: 'One' }) })
  const two = store.save({ server: stdio({ name: 'Two' }) })
  assert.equal(store.active(project).length, 0)
  store.setUse(project, [one.id, 'sconosciuto'])
  assert.deepEqual(store.active(project).map((entry) => entry.server.name), ['One'])
  assert.deepEqual(store.list(project).use, [one.id])
  void two
})

test('mcp: nomi degli strumenti per il modello (prefisso, caratteri ammessi, lunghezza)', () => {
  assert.equal(toolName('docs', 'read file'), 'docs__read_file')
  assert.ok(toolName('docs', 'x'.repeat(100)).length <= 64)
})

test('mcp: con un server vero gli strumenti si elencano, si chiamano, e le regole di conferma e di limite valgono', async (context) => {
  const { store, project } = setup()
  const asked = []
  const client = createMcpClient()
  context.after(() => client.closeAll())
  let answer = true
  const service = createMcpService({ store, client, confirm: async (request) => { asked.push(request); return answer } })

  const saved = store.save({ project, server: stdio({ enabledTools: ['echo', 'write', 'big', 'fail'] }), credentials: { env: { FAKE_TOKEN: 'tok-123' } } })
  // Non confermato: nessuno strumento al modello, e si segnala il perché.
  let offered = await service.tools(project)
  assert.equal(offered.tools.length, 0)
  assert.deepEqual(offered.problems, [{ server: 'Fake', state: 'untrusted' }])
  await assert.rejects(service.test(project, saved.id), /not been confirmed/)

  store.trust(project, saved.id)
  offered = await service.tools(project)
  assert.deepEqual(offered.tools.map((tool) => tool.name).sort(), ['fake__big', 'fake__echo', 'fake__fail', 'fake__write'], "'env' non è acceso: non si offre")
  assert.equal(offered.tools.find((tool) => tool.name === 'fake__echo').inputSchema.properties.text.type, 'string')

  // Sola lettura: nessuna conferma. Scrittura: conferma.
  assert.equal(await service.call(project, 'fake__echo', { text: 'ciao' }), 'echo: ciao')
  assert.equal(asked.length, 0)
  assert.equal(await service.call(project, 'fake__write', { value: 'a' }), 'wrote a')
  assert.equal(asked.length, 1)
  assert.deepEqual(asked[0].args, { value: 'a' })
  answer = false
  await assert.rejects(service.call(project, 'fake__write', { value: 'b' }), /did not allow/)

  // Un risultato lungo si taglia; un errore dello strumento arriva come errore.
  assert.ok((await service.call(project, 'fake__big', {})).length < MAX_RESULT_CHARS + 100)
  await assert.rejects(service.call(project, 'fake__fail', {}), /something went wrong/)
  await assert.rejects(service.call(project, 'fake__env', {}), /not available/)

  // «Chiedi ogni volta»: anche uno strumento di sola lettura chiede.
  store.save({ project, server: { ...stdio({ enabledTools: ['echo'] }), id: saved.id, alwaysAsk: true } })
  answer = true
  asked.length = 0
  await service.tools(project)
  await service.call(project, 'fake__echo', { text: 'x' })
  assert.equal(asked.length, 1)
})

test('mcp: la credenziale arriva al processo del server come variabile d\'ambiente e un server inesistente dà un errore chiaro', async (context) => {
  const { store, project } = setup()
  const client = createMcpClient()
  context.after(() => client.closeAll())
  const service = createMcpService({ store, client, confirm: async () => true })
  const saved = store.save({ project, server: stdio({ enabledTools: ['env'] }), credentials: { env: { FAKE_TOKEN: 'tok-123' } } })
  store.trust(project, saved.id)
  await service.tools(project)
  assert.equal(await service.call(project, 'fake__env', {}), 'tok-123')

  const broken = store.save({ project, server: { name: 'Broken', type: 'stdio', command: process.execPath, args: ['-e', 'process.exit(1)'], enabledTools: ['x'] } })
  store.trust(project, broken.id)
  const result = await service.tools(project)
  assert.ok(result.problems.some((problem) => problem.server === 'Broken' && problem.error), 'un server che si chiude subito è un problema, non un blocco')
  assert.ok(result.tools.length >= 1, 'gli altri server restano')
})
