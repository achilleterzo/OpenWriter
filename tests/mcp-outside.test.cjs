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
function startServer({ a, data }, { readOnly = true } = {}) {
  const child = spawn(process.execPath, [path.join(__dirname, '../electron/mcp-server.cjs'), '--project', a, '--data', data, ...(readOnly ? ['--read-only'] : [])], { stdio: ['pipe', 'pipe', 'pipe'] })
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
  const bridge = createMcpBridge({ directory: env.data, getWindow: () => null, getProjectPath: () => open, isEnabled: () => false, localTools: { search_knowledge: async (args, context) => { calls.push({ ...args, project: context?.project }); return search(args, context) } } })
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

test('MCP: la ricerca dell\'app non dipende dal progetto aperto; senza app si ripiega sull\'indice; un errore vero dell\'app si vede', async () => {
  const env = setup()
  const server = startServer(env)
  try {
    await server.ready
    // App senza ponte: indice letto direttamente.
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo' })).text, /@B\/contratto\.md/)
    // App aperta su un altro progetto: risponde lo stesso, e sa da quale progetto cerca l'agente (A).
    await withBridge(env, { open: env.b, search: () => 'DALL\'APP' }, async (calls) => {
      assert.equal((await server.call('search_knowledge', { query: 'penale ritardo' })).text, 'DALL\'APP')
      assert.equal(calls.length, 1)
      assert.equal(path.resolve(calls[0].project), path.resolve(env.a))
    })
    // App senza nessun progetto aperto: risponde lo stesso.
    await withBridge(env, { open: null, search: () => 'DALL\'APP SENZA PROGETTO' }, async () => {
      assert.equal((await server.call('search_knowledge', { query: 'penale ritardo' })).text, 'DALL\'APP SENZA PROGETTO')
    })
    // Un errore dell'app (per esempio indice spento) non si maschera con un ripiego silenzioso.
    await withBridge(env, { open: env.a, search: () => { throw new Error('The search index is turned off for this project: use search_files') } }, async () => {
      const refused = await server.call('search_knowledge', { query: 'penale ritardo' })
      assert.equal(refused.error, true)
      assert.match(refused.text, /turned off/)
    })
  } finally { server.stop(); fs.rmSync(env.root, { recursive: true, force: true }) }
})

// ----- Spazi di lavoro (workspace): un filtro su ciò che l'agente raggiunge -----
const { createWorkspacesStore } = require('../electron/workspaces-store.cjs')

test('MCP: lo spazio di lavoro attivo limita ricerca e offerta, si rilegge a ogni chiamata, e workspace sceglie altro', async () => {
  const env = setup()
  const store = createWorkspacesStore({ directory: () => env.data })
  const server = startServer(env)
  try {
    await server.ready
    // Senza filtro («Tutti») l'altro progetto si trova.
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo' })).text, /@B\/contratto\.md/)
    // Attivato uno spazio che contiene solo A: B sparisce dalla ricerca e dall'offerta, senza riavviare il server.
    const only = store.create({ name: 'Solo A', projects: [env.a] })
    const both = store.create({ name: 'A e B', projects: [env.a, env.b] })
    store.setActive(only.id)
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo' })).text, /Nothing found/)
    const info = JSON.parse((await server.call('project_info')).text)
    assert.equal(info.workspace, 'Solo A')
    assert.deepEqual(info.sharedWithThisProject.map((item) => item.name), ['@norme'], 'restano i riferimenti del progetto: non sono progetti')
    // `workspace`: false = tutti i progetti; un nome = quello spazio (anche senza badare alle maiuscole); un nome sconosciuto è un errore che elenca gli spazi.
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo', workspace: false })).text, /@B\/contratto\.md/)
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo', workspace: 'a e b' })).text, /@B\/contratto\.md/)
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo', workspace: 'Solo A' })).text, /Nothing found/)
    const unknown = await server.call('search_knowledge', { query: 'penale', workspace: 'Inesistente' })
    assert.equal(unknown.error, true)
    assert.match(unknown.text, /not found.*All, Solo A, A e B/)
    // Leggere un nome `@B` visto in una ricerca non dipende dallo spazio: lo spazio decide cosa si offre e si cerca per impostazione predefinita.
    assert.equal((await server.call('read_document', { path: '@B/contratto.md' })).error, false)
    // Uno spazio con B si vede; tornati a «Tutti» pure.
    store.setActive(both.id)
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo' })).text, /@B\/contratto\.md/)
    store.setActive('all')
    assert.equal(JSON.parse((await server.call('project_info')).text).workspace, 'All')
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo' })).text, /@B\/contratto\.md/)
  } finally { server.stop(); fs.rmSync(env.root, { recursive: true, force: true }) }
})

test('MCP: list_workspaces elenca gli spazi; open_workspace cambia quello attivo (con l\'app chiusa lo scrive nei file); in sola lettura non c\'è', async () => {
  const env = setup()
  const store = createWorkspacesStore({ directory: () => env.data })
  store.create({ name: 'Libro', projects: [env.a, env.b] })
  store.create({ name: 'Lavoro', projects: [env.c] })
  const readOnly = startServer(env)
  const writable = startServer(env, { readOnly: false })
  try {
    await Promise.all([readOnly.ready, writable.ready])
    const listed = JSON.parse((await readOnly.call('list_workspaces')).text)
    assert.equal(listed.active, 'All')
    assert.deepEqual(listed.workspaces.map((item) => item.name), ['All', 'Libro', 'Lavoro'])
    assert.deepEqual(listed.workspaces[1].projects.map((item) => item.name), ['A', 'B'])
    // In sola lettura open_workspace non esiste: cambia ciò che l'utente vede.
    assert.equal((await readOnly.call('open_workspace', { name: 'Libro' })).error, true)
    // Senza l'app: si scrive nei file (vale al prossimo avvio) e si vede subito.
    const opened = await writable.call('open_workspace', { name: 'libro' })
    assert.equal(opened.error, false)
    assert.match(opened.text, /"Libro" is now active/)
    assert.equal(store.active(), store.find('Libro').id)
    assert.equal(JSON.parse((await readOnly.call('list_workspaces')).text).active, 'Libro')
    assert.equal((await writable.call('open_workspace', { name: 'Sconosciuto' })).error, true)
    await writable.call('open_workspace', { name: 'All' })
    assert.equal(store.active(), 'all')
  } finally { readOnly.stop(); writable.stop(); fs.rmSync(env.root, { recursive: true, force: true }) }
})

test('MCP: il progetto che un agente apre da sé gli resta visibile fuori dallo spazio di lavoro; agli altri no', async () => {
  const env = setup()
  const store = createWorkspacesStore({ directory: () => env.data })
  const only = store.create({ name: 'Solo A', projects: [env.a] })
  store.setActive(only.id)
  const calls = []
  let bridge
  // L'app finta risponde a open_project e registra cosa riceve la ricerca locale.
  const window = { isDestroyed: () => false, webContents: { send: (channel, message) => { if (channel === 'mcp:request') setTimeout(() => bridge.answer(message.id, { ok: true, text: 'Project opened.' }), 0) } } }
  bridge = createMcpBridge({ directory: env.data, getWindow: () => window, getProjectPath: () => env.a, isEnabled: () => true, localTools: { search_knowledge: async (args, context) => { calls.push(context); return "risposta dell'app" } } })
  await bridge.start()
  const server = startServer(env, { readOnly: false })
  const stranger = startServer(env, { readOnly: false })
  try {
    await Promise.all([server.ready, stranger.ready])
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo' })).text, /risposta dell'app/)
    assert.deepEqual(calls[0].granted, [], 'prima di aprire nulla non ha concessioni')
    // L'agente apre B e torna su A: B non è nello spazio, ma l'ha aperto lui.
    assert.equal((await server.call('open_project', { path: env.b })).error, false)
    assert.equal((await server.call('open_project', { path: env.a })).error, false)
    await server.call('search_knowledge', { query: 'penale ritardo' })
    assert.deepEqual(calls.at(-1).granted.map((item) => path.basename(item)).sort(), ['A', 'B'], "le concessioni (i progetti che l'agente ha aperto) viaggiano con la ricerca verso l'app")
    // Senza l'app si ripiega sull'indice letto direttamente: la concessione vale lì.
    bridge.stop()
    assert.match((await server.call('search_knowledge', { query: 'penale ritardo' })).text, /@B\/contratto\.md/)
    assert.equal((await server.call('read_document', { path: '@B/contratto.md' })).error, false)
    // Un altro agente (altro processo) non ha concessioni: B per lui resta fuori.
    assert.match((await stranger.call('search_knowledge', { query: 'penale ritardo' })).text, /Nothing found/)
    // Leggere un nome `@B` esplicito non dipende dallo spazio (come con workspace: false): lo spazio e le concessioni decidono cosa si cerca e si offre.
    assert.equal((await stranger.call('read_document', { path: '@B/contratto.md' })).error, false)
    assert.deepEqual(JSON.parse((await stranger.call('project_info')).text).sharedWithThisProject.map((item) => item.name), ['@norme'], 'e non gli viene offerto')
  } finally { bridge.stop(); server.stop(); stranger.stop(); fs.rmSync(env.root, { recursive: true, force: true }) }
})
