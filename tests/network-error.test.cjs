const test = require('node:test')
const assert = require('node:assert/strict')
const net = require('node:net')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAiProviders, networkError } = require('../electron/ai-providers.cjs')

// Una porta libera su cui nessuno ascolta: si apre un server e lo si chiude.
function closedPort() {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.listen(0, '127.0.0.1', () => { const { port } = server.address(); server.close(() => resolve(port)) })
  })
}

function providers() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-net-'))
  const app = { getPath: () => userData, getVersion: () => '0.0.0' }
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (buffer) => buffer.toString() }
  const ai = createAiProviders({ app, safeStorage })
  const base = ai.getSettings()
  return { ai, base, use: (provider, changes) => ai.saveSettings({ ...base, aiEnabled: true, provider, providers: { ...base.providers, [provider]: { ...base.providers[provider], model: 'm', ...changes } } }) }
}

test('rete: un server spento dà un errore leggibile con servizio e indirizzo, non un AggregateError vuoto', async () => {
  const port = await closedPort()
  const { ai, use } = providers()
  use('openai', { preset: 'lmstudio', endpoint: `http://localhost:${port}/v1` })
  await assert.rejects(() => ai.listModels({ provider: 'openai' }), (error) => {
    assert.match(error.message, new RegExp(`LM Studio is not reachable at localhost:${port}`))
    assert.equal(error.code, 'ECONNREFUSED')
    return true
  })
  await assert.rejects(() => ai.listModels({ provider: 'ollama', endpoint: `http://127.0.0.1:${port}` }), /Ollama is not reachable at 127\.0\.0\.1/)
})

test('rete: anche la richiesta in streaming dà lo stesso errore leggibile', async () => {
  const port = await closedPort()
  const { ai, use } = providers()
  use('openai', { preset: 'custom', endpoint: `http://127.0.0.1:${port}` })
  await assert.rejects(() => ai.chatStream([{ role: 'user', content: 'ciao' }]), /OpenAI-compatible is not reachable at 127\.0\.0\.1/)
})

test('rete: networkError riconosce il codice anche dentro un AggregateError e lascia stare gli altri errori', () => {
  const inner = Object.assign(new Error('x'), { code: 'ECONNREFUSED' })
  const aggregate = Object.assign(new AggregateError([inner], ''), { code: undefined })
  assert.match(networkError(aggregate, 'Servizio', 'http://localhost:1234/v1').message, /Servizio is not reachable at localhost:1234/)
  const other = new Error('altro')
  assert.equal(networkError(other, 'Servizio', 'http://localhost:1234/v1'), other)
  // Un timeout non è "irraggiungibile": resta com'è.
  const timeout = Object.assign(new Error('scaduto'), { code: 'ETIMEDOUT' })
  assert.equal(networkError(timeout, 'Servizio', 'http://localhost:1234'), timeout)
})
