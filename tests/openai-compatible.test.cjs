const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAiProviders, normalizeProviderConfig } = require('../electron/ai-providers.cjs')
const { OPENAI_PRESETS, presetDescriptor } = require('../electron/provider-descriptors.cjs')

// ---------- Configurazione ----------

test('openai (preset): configurazione di base con indirizzo e capacità predefiniti', () => {
  assert.deepEqual(normalizeProviderConfig('openai'), { model: '', reasoning: 'default', temperature: '', numPredict: '', preset: 'lmstudio', endpoint: 'http://localhost:1234/v1', vision: 'auto', tools: 'auto', name: '', label: 'LM Studio' })
  assert.equal(normalizeProviderConfig('openai', { preset: 'groq' }).endpoint, 'https://api.groq.com/openai/v1')
  assert.equal(normalizeProviderConfig('openai', { preset: 'inventato' }).preset, 'lmstudio')
  assert.equal(normalizeProviderConfig('openai', { preset: 'vllm', endpoint: 'http://nas:9000/v1//' }).endpoint, 'http://nas:9000/v1')
  // Un indirizzo non valido (o non http) ripiega su quello del preset; il personalizzato resta vuoto finché non si scrive.
  assert.equal(normalizeProviderConfig('openai', { preset: 'llamacpp', endpoint: 'ftp://x' }).endpoint, 'http://localhost:8080/v1')
  assert.equal(normalizeProviderConfig('openai', { preset: 'custom', endpoint: 'non un indirizzo' }).endpoint, '')
  // Capacità: 'auto' (le chiede al server), 'on', 'off'; i vecchi sì/no si convertono (true → 'on', false per gli strumenti → 'off', false per le immagini era il valore di base → 'auto').
  assert.deepEqual([normalizeProviderConfig('openai', { vision: true }).vision, normalizeProviderConfig('openai', { vision: false }).vision, normalizeProviderConfig('openai', { vision: 'off' }).vision, normalizeProviderConfig('openai', { vision: 'boh' }).vision], ['on', 'auto', 'off', 'auto'])
  assert.deepEqual([normalizeProviderConfig('openai', { tools: false }).tools, normalizeProviderConfig('openai', { tools: true }).tools, normalizeProviderConfig('openai', { tools: 'on' }).tools], ['off', 'auto', 'on'])
  // Nome scelto dall'utente: ripulito e mostrato al posto di quello del servizio.
  assert.equal(normalizeProviderConfig('openai', { preset: 'groq', name: '  Xerj sperimentale  ' }).label, 'Xerj sperimentale')
  assert.equal(normalizeProviderConfig('openai', { name: 'x'.repeat(100) }).name.length, 40)
  assert.equal(normalizeProviderConfig('openai', { preset: 'custom' }).label, 'OpenAI-compatible')
})

test('openai (preset): ogni preset ha etichetta, indirizzo e obbligo del token; i server locali non lo chiedono', () => {
  for (const [id, preset] of Object.entries(OPENAI_PRESETS)) {
    assert.ok(preset.label, id)
    assert.equal(typeof preset.keyRequired, 'boolean', id)
  }
  for (const local of ['lmstudio', 'llamacpp', 'vllm', 'custom']) assert.equal(OPENAI_PRESETS[local].keyRequired, false, local)
  for (const hosted of ['openai', 'groq', 'together', 'mistral', 'deepseek']) assert.equal(OPENAI_PRESETS[hosted].keyRequired, true, hosted)
  const descriptor = presetDescriptor('openai', 'https://proxy.example/v1/')
  assert.equal(descriptor.baseUrl, 'https://proxy.example/v1')
  assert.equal(descriptor.reasoningParam, 'reasoning_effort')
  assert.equal(presetDescriptor('lmstudio').reasoningParam, undefined)
})

// ---------- Con un server finto ----------

function fakeService(handler) {
  const requests = []
  const server = http.createServer((request, response) => {
    let raw = ''
    request.on('data', (piece) => { raw += piece })
    request.on('end', () => {
      const body = raw ? JSON.parse(raw) : null
      requests.push({ method: request.method, url: request.url, headers: request.headers, body })
      const { status = 200, chunks = [], json, error } = handler(body, request, requests.length)
      if (json) { response.writeHead(200, { 'Content-Type': 'application/json' }); return response.end(JSON.stringify(json)) }
      if (status !== 200) { response.writeHead(status, { 'Content-Type': 'application/json' }); return response.end(JSON.stringify({ error: { message: error || 'errore' } })) }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const chunk of chunks) response.write(`data: ${JSON.stringify(chunk)}\n\n`)
      response.end('data: [DONE]\n\n')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}` })))
}

function openAiProviders(config) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-openai-'))
  const app = { getPath: () => userData, getVersion: () => '0.0.0' }
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (buffer) => buffer.toString() }
  const ai = createAiProviders({ app, safeStorage })
  const use = (changes) => {
    const base = ai.getSettings()
    ai.saveSettings({ ...base, aiEnabled: true, provider: 'openai', providers: { ...base.providers, openai: { ...base.providers.openai, ...changes } } })
  }
  use({ model: 'm', ...config })
  return { ai, use }
}

const answer = (text) => ({ chunks: [{ choices: [{ delta: { content: text } }] }] })

test('openai (preset): un server locale senza token risponde e non riceve Authorization', async () => {
  const service = await fakeService(() => answer('Ciao'))
  try {
    const { ai } = openAiProviders({ preset: 'lmstudio', endpoint: service.url })
    assert.equal(await ai.chatStream([{ role: 'user', content: 'salve' }]), 'Ciao')
    const [request] = service.requests
    assert.equal(request.url, '/chat/completions')
    assert.equal(request.headers.authorization, undefined)
    assert.deepEqual(request.body, { model: 'm', messages: [{ role: 'user', content: 'salve' }], stream_options: { include_usage: true }, stream: true })
    const status = await ai.getStatus('openai')
    assert.deepEqual([status.installed, status.authenticated, status.configured], [true, false, true])
  } finally { service.server.close() }
})

test('openai (preset): con il token salvato lo invia come Bearer', async () => {
  const service = await fakeService(() => answer('ok'))
  try {
    const { ai } = openAiProviders({ preset: 'custom', endpoint: service.url })
    ai.saveApiKey('segreto', 'openai')
    assert.equal(ai.hasApiKey('openai'), true)
    await ai.chatStream([{ role: 'user', content: 'x' }])
    assert.equal(service.requests[0].headers.authorization, 'Bearer segreto')
    assert.equal((await ai.getStatus('openai')).authenticated, true)
  } finally { service.server.close() }
})

test('openai (preset): la chiave è legata a preset e indirizzo: cambiando uno dei due non viene più inviata', async () => {
  const service = await fakeService(() => answer('ok'))
  try {
    const { ai, use } = openAiProviders({ preset: 'custom', endpoint: service.url })
    ai.saveApiKey('segreto', 'openai')
    use({ endpoint: `${service.url.replace('127.0.0.1', 'localhost')}` })
    assert.equal(ai.hasApiKey('openai'), false, 'altro indirizzo')
    await ai.chatStream([{ role: 'user', content: 'x' }])
    assert.equal(service.requests[0].headers.authorization, undefined)
    use({ endpoint: service.url, preset: 'lmstudio' })
    assert.equal(ai.hasApiKey('openai'), false, 'altro preset')
    use({ endpoint: service.url, preset: 'custom' })
    assert.equal(ai.hasApiKey('openai'), true, 'si ritrova tornando indietro')
  } finally { service.server.close() }
})

test('openai (preset): un servizio con token obbligatorio non parte senza chiave', async () => {
  const service = await fakeService(() => answer('ok'))
  try {
    const { ai } = openAiProviders({ preset: 'openai', endpoint: service.url })
    await assert.rejects(() => ai.chatStream([{ role: 'user', content: 'x' }]), /OpenAI API key required/)
    assert.equal(service.requests.length, 0)
    assert.equal((await ai.getStatus('openai')).configured, false)
    ai.saveApiKey('k', 'openai')
    assert.equal((await ai.getStatus('openai')).configured, true)
    assert.equal(await ai.chatStream([{ role: 'user', content: 'x' }]), 'ok')
    assert.equal(service.requests[0].headers.authorization, 'Bearer k')
  } finally { service.server.close() }
})

test('openai (preset): senza indirizzo o modello la richiesta dice cosa configurare', async () => {
  const { ai } = openAiProviders({ preset: 'custom', endpoint: '' })
  await assert.rejects(() => ai.chatStream([{ role: 'user', content: 'x' }]), /Configure the address and model/)
})

test('openai (preset): il ragionamento va solo ai preset che lo dichiarano e, se il modello lo rifiuta, si riprova senza', async () => {
  const local = await fakeService(() => answer('a'))
  const hosted = await fakeService((body) => (body.reasoning_effort ? { status: 400, error: 'non supportato' } : answer('b')))
  try {
    const lm = openAiProviders({ preset: 'lmstudio', endpoint: local.url, reasoning: 'high' })
    await lm.ai.chatStream([{ role: 'user', content: 'x' }])
    assert.equal(local.requests[0].body.reasoning_effort, undefined)
    const remote = openAiProviders({ preset: 'groq', endpoint: hosted.url, reasoning: 'high' })
    remote.ai.saveApiKey('k', 'openai')
    assert.equal(await remote.ai.chatStream([{ role: 'user', content: 'x' }]), 'b')
    assert.equal(hosted.requests[0].body.reasoning_effort, 'high')
    assert.equal(hosted.requests[1].body.reasoning_effort, undefined)
  } finally { local.server.close(); hosted.server.close() }
})

test('openai (preset): senza risposte dal server le capacità sono quelle di base e chi configura le può imporre', async () => {
  const { ai, use } = openAiProviders({ preset: 'lmstudio', endpoint: 'http://127.0.0.1:1/v1' })
  assert.deepEqual(await ai.getCapabilities('m', 'openai'), { known: true, vision: false, tools: true, pdf: false, detected: false })
  use({ vision: 'on', tools: 'off', endpoint: 'http://127.0.0.1:1/v1' })
  assert.deepEqual(await ai.getCapabilities('m', 'openai'), { known: true, vision: true, tools: false, pdf: false, detected: false })
  use({ model: '' })
  assert.equal((await ai.getCapabilities('', 'openai')).known, false, 'senza modello non si sa nulla')
})

test('openai (preset): i PDF non si offrono ai server generici', async () => {
  const service = await fakeService(() => answer('ok'))
  try {
    const { ai } = openAiProviders({ preset: 'lmstudio', endpoint: service.url })
    await assert.rejects(() => ai.chatStream([{ role: 'user', content: 'x', files: [{ mime: 'application/pdf', name: 'a.pdf', data: 'AA' }] }]), /cannot read PDF/)
  } finally { service.server.close() }
})

test('openai (preset): l\'elenco modelli viene da /models, ordinato, con l\'indirizzo dato e il token se c\'è', async () => {
  const service = await fakeService(() => ({ json: { data: [{ id: 'zeta' }, { id: 'alfa' }, { id: 'mu' }] } }))
  try {
    const { ai } = openAiProviders({ preset: 'custom', endpoint: service.url })
    assert.deepEqual(await ai.listModels({ provider: 'openai' }), ['alfa', 'mu', 'zeta'])
    assert.equal(service.requests[0].url, '/models')
    assert.equal(service.requests[0].headers.authorization, undefined)
    // Indirizzo e token dati dalla pagina delle impostazioni, prima del salvataggio.
    assert.deepEqual(await ai.listModels({ provider: 'openai', endpoint: `${service.url}/` }), ['alfa', 'mu', 'zeta'])
    ai.saveApiKey('k', 'openai')
    await ai.listModels({ provider: 'openai' })
    assert.equal(service.requests.at(-1).headers.authorization, 'Bearer k')
  } finally { service.server.close() }
})
