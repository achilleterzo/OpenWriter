const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { claudeIsolationArgs, createAiProviders, normalizeProviderConfig } = require('../electron/ai-providers.cjs')

// Un provider con cartella dati temporanea e cifratura finta (la chiave si legge e si scrive in chiaro nel test).
function makeProviders() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-ai-'))
  const app = { getPath: () => userData, getVersion: () => '0.0.0' }
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (text) => Buffer.from(text), decryptString: (buffer) => buffer.toString() }
  return { ai: createAiProviders({ app, safeStorage }), userData }
}

// Server che risponde a /api/tags e registra l'intestazione Authorization di ogni richiesta.
function tagsServer() {
  const seen = []
  const server = http.createServer((request, response) => {
    seen.push(request.headers.authorization)
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ models: [{ name: 'llama3' }] }))
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}` })))
}

test('ai-providers: Claude parte senza i server MCP e senza le skill dell\'utente', () => {
  const args = claudeIsolationArgs('C:/dati/claude-empty-mcp.json')
  assert.ok(args.includes('--strict-mcp-config'), 'solo i server della configurazione data, cioè nessuno')
  assert.equal(args[args.indexOf('--mcp-config') + 1], 'C:/dati/claude-empty-mcp.json')
  assert.ok(args.includes('--disable-slash-commands'))
})

test('ai-providers: Ollama locale e cloud hanno entrambi un endpoint, con il predefinito giusto', () => {
  assert.equal(normalizeProviderConfig('ollama').endpoint, 'http://localhost:11434')
  assert.equal(normalizeProviderConfig('ollama-cloud').endpoint, 'https://ollama.com')
  assert.equal(normalizeProviderConfig('ollama', { endpoint: 'http://nas:11434//' }).endpoint, 'http://nas:11434')
  assert.equal(normalizeProviderConfig('ollama-cloud', { endpoint: 'https://proxy.example/ollama/' }).endpoint, 'https://proxy.example/ollama')
  assert.equal(normalizeProviderConfig('openrouter').endpoint, undefined)
})

test('ai-providers: keep_alive resta solo per Ollama locale, num_ctx per entrambi', () => {
  assert.equal(normalizeProviderConfig('ollama', { keepAlive: '5m', numCtx: 8192 }).keepAlive, '5m')
  assert.equal(normalizeProviderConfig('ollama-cloud', { keepAlive: '5m', numCtx: 8192 }).keepAlive, undefined)
  assert.equal(normalizeProviderConfig('ollama-cloud', { numCtx: 8192 }).numCtx, 8192)
})

test('ai-providers: Ollama locale senza token non invia Authorization', async () => {
  const { server, seen, url } = await tagsServer()
  try {
    const { ai } = makeProviders()
    assert.deepEqual(await ai.listModels({ provider: 'ollama', endpoint: url }), ['llama3'])
    assert.deepEqual(seen, [undefined])
  } finally { server.close() }
})

test('ai-providers: Ollama locale con token lo invia come Bearer', async () => {
  const { server, seen, url } = await tagsServer()
  try {
    const { ai } = makeProviders()
    await ai.listModels({ provider: 'ollama', endpoint: url, apiKey: 'segreto' })
    assert.deepEqual(seen, ['Bearer segreto'])
    ai.saveApiKey('salvato', 'ollama')
    await ai.listModels({ provider: 'ollama', endpoint: url })
    assert.equal(seen[1], 'Bearer salvato')
  } finally { server.close() }
})

test('ai-providers: Ollama Cloud senza chiave dà errore, il locale è sempre utilizzabile', async () => {
  const { ai } = makeProviders()
  await assert.rejects(() => ai.listModels({ provider: 'ollama-cloud' }), /API key required/)
  assert.equal((await ai.getStatus('ollama')).authenticated, false)
  ai.saveApiKey('k', 'ollama')
  assert.equal((await ai.getStatus('ollama')).authenticated, true)
})

test('ai-providers: la chiave si salva solo per provider noti', () => {
  const { ai } = makeProviders()
  assert.throws(() => ai.saveApiKey('k', '../evil'), /Unknown provider/)
})
