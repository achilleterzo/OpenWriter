const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAiProviders } = require('../electron/ai-providers.cjs')

function providers() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-list-'))
  const app = { getPath: () => userData, getVersion: () => '0.0.0' }
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (buffer) => buffer.toString() }
  return createAiProviders({ app, safeStorage })
}

function server(handler) {
  const requests = []
  const instance = http.createServer((request, response) => {
    requests.push(request.url)
    handler(request, response)
  })
  return new Promise((resolve) => instance.listen(0, '127.0.0.1', () => resolve({ instance, requests, url: `http://127.0.0.1:${instance.address().port}` })))
}

test('elenco modelli: un server compatibile non ancora salvato non si scambia per Ollama', async () => {
  const ai = providers()
  const service = await server((request, response) => { response.end('{}') })
  try {
    // L'interfaccia chiede i modelli del nuovo server prima che le impostazioni siano salvate: nessuna richiesta a /api/tags, un errore chiaro.
    await assert.rejects(() => ai.listModels({ provider: 'openai-ab12cd', endpoint: `${service.url}/v1` }), /not saved yet/)
    await assert.rejects(() => ai.listModelInputs({ provider: 'openai-ab12cd', endpoint: `${service.url}/v1` }), /not saved yet/)
    assert.deepEqual(service.requests, [])
    await assert.rejects(() => ai.listModels({ provider: 'sconosciuto' }), /Unknown provider/)
  } finally { service.instance.close() }
})

test('elenco modelli: dopo il salvataggio il server si interroga sul suo indirizzo', async () => {
  const service = await server((request, response) => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify({ data: [{ id: 'xerj-1' }, { id: 'xerj-0' }] })) })
  try {
    const ai = providers()
    const base = ai.getSettings()
    ai.saveSettings({ ...base, aiEnabled: true, providers: { ...base.providers, 'openai-ab12cd': { preset: 'custom', endpoint: `${service.url}/v1`, name: 'Xerj', model: 'xerj-1' } } })
    assert.deepEqual(await ai.listModels({ provider: 'openai-ab12cd' }), ['xerj-0', 'xerj-1'])
    assert.deepEqual(service.requests, ['/v1/models'])
  } finally { service.instance.close() }
})

test('elenco modelli: un servizio senza /models lo dice chiaramente, con il suo nome, e non è un errore generico', async () => {
  const service = await server((request, response) => { response.statusCode = 404; response.end('404 page not found') })
  try {
    const ai = providers()
    const base = ai.getSettings()
    ai.saveSettings({ ...base, aiEnabled: true, providers: { ...base.providers, 'openai-ab12cd': { preset: 'custom', endpoint: `${service.url}/v1`, name: 'Xerj', model: 'm' } } })
    await assert.rejects(() => ai.listModels({ provider: 'openai-ab12cd' }), (error) => {
      assert.match(error.message, /Xerj does not list its models/)
      assert.match(error.message, /\/v1\/models answered 404/)
      assert.match(error.message, /type the model name by hand/)
      return true
    })
  } finally { service.instance.close() }
})
