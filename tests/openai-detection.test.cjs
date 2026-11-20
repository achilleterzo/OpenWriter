const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAiProviders } = require('../electron/ai-providers.cjs')

// Server che imita le API native di Ollama: /api/version e /api/show con le capacità del modello. `models` = { nome: [capacità] }.
function fakeOllama(models, { version = '0.9.0', auth = null } = {}) {
  const requests = []
  const server = http.createServer((request, response) => {
    let raw = ''
    request.on('data', (piece) => { raw += piece })
    request.on('end', () => {
      requests.push({ method: request.method, url: request.url, headers: request.headers, body: raw ? JSON.parse(raw) : null })
      response.setHeader('Content-Type', 'application/json')
      if (auth && request.headers.authorization !== auth) { response.statusCode = 401; return response.end('{"error":"no"}') }
      if (request.url === '/api/version' && version) return response.end(JSON.stringify({ version }))
      if (request.url === '/api/show') {
        const model = JSON.parse(raw).model
        if (!models[model]) { response.statusCode = 404; return response.end('{"error":"model not found"}') }
        return response.end(JSON.stringify(models[model] === 'old' ? { details: {} } : { capabilities: models[model] }))
      }
      response.statusCode = 404
      response.end('{"error":"not found"}')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}` })))
}

function providers(config) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-detect-'))
  const app = { getPath: () => userData, getVersion: () => '0.0.0' }
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (buffer) => buffer.toString() }
  const ai = createAiProviders({ app, safeStorage })
  const use = (changes) => {
    const base = ai.getSettings()
    ai.saveSettings({ ...base, aiEnabled: true, provider: 'openai', providers: { ...base.providers, openai: { ...base.providers.openai, ...changes } } })
  }
  use({ model: 'llava', ...config })
  return { ai, use }
}

test('rilevamento: Ollama dietro /v1 dice da sé se il modello vede le immagini e usa gli strumenti', async () => {
  const service = await fakeOllama({ llava: ['completion', 'vision'], llama3: ['completion', 'tools'], completo: ['completion', 'vision', 'tools'] })
  try {
    const { ai } = providers({ preset: 'custom', endpoint: `${service.url}/v1` })
    assert.deepEqual(await ai.getCapabilities('llava', 'openai'), { known: true, vision: true, tools: false, pdf: false, detected: true })
    assert.deepEqual(await ai.getCapabilities('llama3', 'openai'), { known: true, vision: false, tools: true, pdf: false, detected: true })
    assert.deepEqual(await ai.getCapabilities('completo', 'openai'), { known: true, vision: true, tools: true, pdf: false, detected: true })
    // Il rilevamento usa la radice dell'indirizzo, senza /v1.
    assert.ok(service.requests.every((request) => request.url.startsWith('/api/')))
    assert.deepEqual(service.requests.find((request) => request.url === '/api/show').body, { model: 'llava' })
  } finally { service.server.close() }
})

test('rilevamento: le scelte "Sì" e "No" dell\'utente prevalgono su ciò che dice il server', async () => {
  const service = await fakeOllama({ llava: ['completion', 'vision'] })
  try {
    const { ai, use } = providers({ preset: 'custom', endpoint: `${service.url}/v1`, vision: 'off', tools: 'on' })
    assert.deepEqual(await ai.getCapabilities('llava', 'openai'), { known: true, vision: false, tools: true, pdf: false, detected: false })
    use({ preset: 'custom', endpoint: `${service.url}/v1`, vision: 'auto', tools: 'on' })
    const result = await ai.getCapabilities('llava', 'openai')
    assert.deepEqual([result.vision, result.tools, result.detected], [true, true, true])
  } finally { service.server.close() }
})

test('rilevamento: se non è Ollama o non riporta le capacità si ripiega sui valori di base, e un errore non rompe nulla', async () => {
  const notOllama = await fakeOllama({}, { version: null })
  const old = await fakeOllama({ vecchio: 'old' })
  const missing = await fakeOllama({})
  try {
    for (const [service, model] of [[notOllama, 'x'], [old, 'vecchio'], [missing, 'assente']]) {
      const { ai } = providers({ preset: 'custom', endpoint: `${service.url}/v1`, model })
      assert.deepEqual(await ai.getCapabilities(model, 'openai'), { known: true, vision: false, tools: true, pdf: false, detected: false })
    }
  } finally { notOllama.server.close(); old.server.close(); missing.server.close() }
})

test('rilevamento: il risultato si ricorda (una sola interrogazione per modello) e si invia il token se c\'è', async () => {
  const service = await fakeOllama({ llava: ['vision'] }, { auth: 'Bearer segreto' })
  try {
    const { ai } = providers({ preset: 'custom', endpoint: `${service.url}/v1` })
    ai.saveApiKey('segreto', 'openai')
    await ai.getCapabilities('llava', 'openai')
    await ai.getCapabilities('llava', 'openai')
    assert.equal(service.requests.filter((request) => request.url === '/api/show').length, 1)
    assert.ok(service.requests.every((request) => request.headers.authorization === 'Bearer segreto'))
  } finally { service.server.close() }
})

test('rilevamento: con tutto impostato a mano non si interroga il server', async () => {
  const service = await fakeOllama({ llava: ['vision'] })
  try {
    const { ai } = providers({ preset: 'custom', endpoint: `${service.url}/v1`, vision: 'on', tools: 'off' })
    await ai.getCapabilities('llava', 'openai')
    assert.equal(service.requests.length, 0)
  } finally { service.server.close() }
})

test('nome: il nome scelto compare negli errori del provider al posto di quello del servizio', async () => {
  const { ai } = providers({ preset: 'openai', endpoint: 'http://127.0.0.1:9/v1', name: 'Xerj' })
  await assert.rejects(() => ai.chatStream([{ role: 'user', content: 'x' }]), /Xerj API key required/)
})
