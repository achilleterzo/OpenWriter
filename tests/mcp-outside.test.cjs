const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { createKnowledgeIndex } = require('../electron/knowledge-index.cjs')
const { projectKey } = require('../electron/knowledge-service.cjs')

/**
 * Il server MCP vero (stdio) su dati finti: un progetto A, una cartella di riferimento `norme` collegata ad A e un altro progetto B che condivide;
 * un terzo progetto C che ha scelto di restarne fuori. L'indice lo costruisce il test (come farebbe l'app).
 */
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-mcp-'))
  const make = (name, files, settings) => {
    const directory = path.join(root, name)
    fs.mkdirSync(path.join(directory, '.ow'), { recursive: true })
    if (settings) fs.writeFileSync(path.join(directory, '.ow', 'project.json'), JSON.stringify({ name, options: settings }))
    for (const [file, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true })
      fs.writeFileSync(path.join(directory, file), text)
    }
    return directory
  }
  const a = make('A', { 'nota.md': '# Nota\n\nIl faro di A.\n' })
  const b = make('B', { 'contratto.md': '# Contratto\n\nLa penale per il ritardo è del dieci per cento.\n', 'sotto/cap.md': '# Capitolo\n\nIl mare di B.\n' })
  const c = make('C', { 'segreto.md': '# Segreto\n\nLa penale riservata di C.\n' }, { searchIndex: true, sharedKnowledge: false })
  const norme = path.join(root, 'norme')
  fs.mkdirSync(norme)
  fs.writeFileSync(path.join(norme, 'pei.md'), '# PEI\n\nIl Piano Educativo Individualizzato è il documento della scuola.\n')
  fs.writeFileSync(path.join(a, '.ow', 'references.json'), JSON.stringify([{ name: 'norme', path: norme, addedAt: new Date().toISOString() }]))
  const data = path.join(root, 'data')
  fs.mkdirSync(data)
  fs.writeFileSync(path.join(data, 'projects.json'), JSON.stringify([a, b, c].map((project) => ({ path: project, openedAt: new Date().toISOString() }))))
  const index = createKnowledgeIndex({ file: path.join(data, 'knowledge.db') })
  for (const directory of [a, b, c, norme]) {
    const walk = (folder, base) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const relative = base ? `${base}/${entry.name}` : entry.name
        if (entry.isDirectory()) walk(path.join(folder, entry.name), relative)
        else index.indexFile(projectKey(directory), relative, fs.readFileSync(path.join(folder, entry.name), 'utf8'))
      }
    }
    walk(directory, '')
  }
  index.close()
  return { root, a, b, c, norme, data }
}

// Avvia il server su A e restituisce call(tool, args) → testo (o errore).
function startServer({ a, data }) {
  const child = spawn(process.execPath, [path.join(__dirname, '../electron/mcp-server.cjs'), '--project', a, '--data', data, '--read-only'], { stdio: ['pipe', 'pipe', 'pipe'] })
  const waiting = new Map()
  let buffer = ''
  child.stdout.on('data', (chunk) => {
    buffer += chunk
    let at
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, at)
      buffer = buffer.slice(at + 1)
      if (!line.trim()) continue
      const message = JSON.parse(line)
      waiting.get(message.id)?.(message)
    }
  })
  let id = 0
  const send = (method, params) => new Promise((resolve) => { const mine = ++id; waiting.set(mine, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: mine, method, params })}\n`) })
  return {
    ready: send('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } }),
    async call(name, args = {}) {
      const answer = await send('tools/call', { name, arguments: args })
      const content = answer.result?.content?.[0]?.text ?? answer.error?.message ?? ''
      return { text: content, error: Boolean(answer.result?.isError || answer.error) }
    },
    stop: () => child.kill(),
  }
}

test('MCP: la ricerca copre riferimenti e altri progetti che condividono; chi ha escluso la condivisione no', async () => {
  const env = setup()
  const server = startServer(env)
  try {
    await server.ready
    const all = await server.call('search_knowledge', { query: 'penale ritardo' })
    assert.match(all.text, /@B\/contratto\.md/)
    assert.doesNotMatch(all.text, /riservata|@C\//)
    const reference = await server.call('search_knowledge', { query: 'piano educativo individualizzato' })
    assert.match(reference.text, /@norme\/pei\.md/)
    // Il progetto solo: né l'altro progetto né il riferimento.
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo', scope: 'project' })).text, /Nothing found/)
    assert.match((await server.call('search_knowledge', { query: 'faro', scope: 'project' })).text, /nota\.md/)
    // `others` e un percorso `@nome` restringono.
    assert.doesNotMatch((await server.call('search_knowledge', { query: 'faro', scope: 'others' })).text, /nota\.md/)
    const one = await server.call('search_knowledge', { query: 'mare', path: '@B/sotto' })
    assert.match(one.text, /@B\/sotto\/cap\.md/)
    assert.match((await server.call('search_knowledge', { query: 'penale', path: '@B/sotto' })).text, /Nothing found/)
  } finally { server.stop(); fs.rmSync(env.root, { recursive: true, force: true }) }
})

test('MCP: read_document e list_documents leggono @nome/… (sola lettura, dentro quella cartella); project_info li elenca', async () => {
  const env = setup()
  const server = startServer(env)
  try {
    await server.ready
    const info = JSON.parse((await server.call('project_info')).text)
    assert.deepEqual(info.sharedWithThisProject.map((item) => [item.name, item.kind]).sort(), [['@B', 'project'], ['@norme', 'reference folder']])
    const read = JSON.parse((await server.call('read_document', { path: '@B/contratto.md' })).text)
    assert.equal(read.path, '@B/contratto.md')
    assert.match(read.content, /penale/)
    const lines = JSON.parse((await server.call('read_document', { path: '@norme/pei.md', startLine: 3, endLine: 3 })).text)
    assert.match(lines.content, /Piano Educativo/)
    const listing = JSON.parse((await server.call('list_documents', { path: '@B' })).text)
    assert.equal(listing.path, '@B/')
    assert.ok(listing.entries.some((entry) => entry.name === 'contratto.md'))
    // Fuori da quella cartella, un progetto escluso, una sigla sconosciuta: rifiutati.
    for (const bad of ['@B/../C/segreto.md', '@C/segreto.md', '@nessuno/x.md']) {
      const refused = await server.call('read_document', { path: bad })
      assert.equal(refused.error, true, bad)
    }
  } finally { server.stop(); fs.rmSync(env.root, { recursive: true, force: true }) }
})

// ----- Con l'app aperta la ricerca passa dal ponte locale (stessa ricerca dell'assistente, quindi anche per significato) -----
const { createMcpBridge } = require('../electron/mcp-bridge.cjs')

async function withBridge(env, { open, search }, work) {
  const calls = []
  // Nessuna finestra e modifiche degli agenti spente: la ricerca è locale e di sola lettura, deve funzionare lo stesso.
  const bridge = createMcpBridge({ directory: env.data, getWindow: () => null, getProjectPath: () => open, isEnabled: () => false, localTools: { search_knowledge: async (args) => { calls.push(args); return search(args) } } })
  await bridge.start()
  try { return await work(calls) } finally { bridge.stop() }
}

test('MCP con l\'app aperta: la ricerca la fa l\'app (anche per significato), nonostante le modifiche degli agenti siano spente', async () => {
  const env = setup()
  const server = startServer(env)
  try {
    await server.ready
    await withBridge(env, { open: env.a, search: (args) => `DALL'APP: ${args.query} (${args.scope || 'all'})` }, async (calls) => {
      const answer = await server.call('search_knowledge', { query: 'canone di affitto', scope: 'others' })
      assert.equal(answer.text, "DALL'APP: canone di affitto (others)")
      assert.deepEqual(calls.map((call) => call.query), ['canone di affitto'])
    })
  } finally { server.stop(); fs.rmSync(env.root, { recursive: true, force: true }) }
})

test('MCP: se l\'app ha aperto un altro progetto, non c\'è o non conosce lo strumento si ripiega sull\'indice; un errore vero dell\'app si vede', async () => {
  const env = setup()
  const server = startServer(env)
  try {
    await server.ready
    // App senza ponte: indice letto direttamente.
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo' })).text, /@B\/contratto\.md/)
    // App aperta su un altro progetto: 409, si ripiega.
    await withBridge(env, { open: env.b, search: () => 'NON DOVREBBE ARRIVARE' }, async (calls) => {
      assert.match((await server.call('search_knowledge', { query: 'penale ritardo' })).text, /@B\/contratto\.md/)
      assert.equal(calls.length, 0)
    })
    // Un errore dell'app (per esempio indice spento) non si maschera con un ripiego silenzioso.
    await withBridge(env, { open: env.a, search: () => { throw new Error('The search index is turned off for this project: use search_files') } }, async () => {
      const refused = await server.call('search_knowledge', { query: 'penale ritardo' })
      assert.equal(refused.error, true)
      assert.match(refused.text, /turned off/)
    })
  } finally { server.stop(); fs.rmSync(env.root, { recursive: true, force: true }) }
})
