const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createAiProviders, normalizeSettings } = require('../electron/ai-providers.cjs')
const { isCompatibleProvider } = require('../electron/provider-descriptors.cjs')
const { cleanModelChoice, applyModelChoice } = require('../electron/model-choice.cjs')
const { nativeTemperature } = require('../electron/temperature.cjs')

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=='

test('più provider: gli id dei server compatibili hanno una forma precisa', () => {
  for (const valid of ['openai', 'openai-ab12cd', 'openai-0000', 'openai-abcdefghijkl']) assert.equal(isCompatibleProvider(valid), true, valid)
  for (const invalid of ['openai-', 'openai-abc', 'openai-ABCDEF', 'openai-ab_cd1', 'openaix', 'xopenai', 'openai-abcdefghijklm', '', null, 7]) assert.equal(isCompatibleProvider(invalid), false, String(invalid))
})

test('più provider: le impostazioni conservano i server aggiunti, ne scartano gli id sbagliati e ne limitano il numero', () => {
  const settings = normalizeSettings({
    provider: 'openai-ab12cd',
    providers: {
      'openai-ab12cd': { preset: 'groq', name: 'Veloce', model: 'm' },
      'openai-zz99zz': { preset: 'custom', endpoint: 'http://nas:8000/v1' },
      'openai-x': { preset: 'groq' },
      'openai-ABCDEF': { preset: 'groq' },
      gemini: { model: 'g' },
    },
  })
  assert.equal(settings.provider, 'openai-ab12cd')
  assert.deepEqual(Object.keys(settings.providers).filter(isCompatibleProvider).sort(), ['openai', 'openai-ab12cd', 'openai-zz99zz'])
  assert.equal(settings.providers['openai-ab12cd'].label, 'Veloce')
  assert.equal(settings.providers['openai-ab12cd'].endpoint, 'https://api.groq.com/openai/v1')
  assert.equal(settings.providers['openai-zz99zz'].endpoint, 'http://nas:8000/v1')
  // Un server scelto che non c'è più: si torna a Ollama.
  assert.equal(normalizeSettings({ provider: 'openai-ab12cd', providers: {} }).provider, 'ollama')
  // Un massimo di server aggiunti.
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`openai-a${String(index).padStart(3, '0')}`, { preset: 'vllm' }]))
  assert.ok(Object.keys(normalizeSettings({ providers: many }).providers).filter(isCompatibleProvider).length <= 20)
})

test('più provider: elenco dei provider attivi e icone valgono anche per i server aggiunti', () => {
  const settings = normalizeSettings({
    provider: 'ollama',
    providers: { 'openai-ab12cd': { preset: 'vllm', model: 'm' } },
    activeProviders: ['ollama', 'openai-ab12cd', 'openai-nonesiste'],
    providerIcons: { 'openai-ab12cd': PNG, 'openai-nonesiste': PNG, gemini: PNG },
  })
  assert.deepEqual(settings.activeProviders, ['ollama', 'openai-ab12cd'])
  assert.deepEqual(Object.keys(settings.providerIcons), ['openai-ab12cd', 'openai-nonesiste'].filter((name) => name in settings.providerIcons))
  assert.equal('gemini' in settings.providerIcons, false)
  // Impostazioni vecchie: un server aggiunto con un modello resta visibile.
  assert.deepEqual(normalizeSettings({ provider: 'ollama', providers: { 'openai-ab12cd': { model: 'm' } } }).activeProviders, ['ollama', 'openai-ab12cd'])
})

test('più provider: la scelta di un progetto può indicare un server aggiunto, e se non c\'è più valgono le impostazioni generali', () => {
  assert.equal(cleanModelChoice({ provider: 'openai-ab12cd', model: 'm' }).provider, 'openai-ab12cd')
  assert.equal(cleanModelChoice({ provider: 'openai-x', model: 'm' }), null)
  const settings = normalizeSettings({ provider: 'ollama', providers: { 'openai-ab12cd': { preset: 'vllm', model: 'base' } } })
  const levels = { 'openai-ab12cd': ['default', 'low', 'high'] }
  const applied = applyModelChoice(settings, { provider: 'openai-ab12cd', model: 'altro', reasoning: 'high' }, { reasoningLevels: levels })
  assert.equal(applied.provider, 'openai-ab12cd')
  assert.equal(applied.providers['openai-ab12cd'].model, 'altro')
  assert.equal(applied.providers['openai-ab12cd'].reasoning, 'high')
  assert.equal(applyModelChoice(settings, { provider: 'openai-zz99zz', model: 'x' }), settings)
  assert.equal(nativeTemperature('openai-ab12cd', 0.5), 1)
})

// ---------- Due server insieme ----------

function service(label) {
  const requests = []
  const server = http.createServer((request, response) => {
    let raw = ''
    request.on('data', (piece) => { raw += piece })
    request.on('end', () => {
      requests.push({ url: request.url, headers: request.headers, body: raw ? JSON.parse(raw) : null })
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content: label } }] })}\n\n`)
      response.end('data: [DONE]\n\n')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}` })))
}

function providers() {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-multi-'))
  const app = { getPath: () => userData, getVersion: () => '0.0.0' }
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (buffer) => buffer.toString() }
  return createAiProviders({ app, safeStorage })
}

test('più provider: due server compatibili lavorano insieme, ognuno con il suo indirizzo, nome, chiave e modello', async () => {
  const one = await service('uno')
  const two = await service('due')
  try {
    const ai = providers()
    const base = ai.getSettings()
    ai.saveSettings({
      ...base,
      aiEnabled: true,
      provider: 'openai',
      providers: {
        ...base.providers,
        openai: { ...base.providers.openai, preset: 'lmstudio', endpoint: one.url, name: 'Locale', model: 'm1' },
        'openai-two222': { preset: 'custom', endpoint: two.url, name: 'Xerj', model: 'm2', reasoning: 'default' },
      },
    })
    ai.saveApiKey('chiave-due', 'openai-two222')
    assert.equal(ai.hasApiKey('openai'), false)
    assert.equal(ai.hasApiKey('openai-two222'), true)

    assert.equal(await ai.chatStream([{ role: 'user', content: 'a' }]), 'uno')
    assert.equal(await ai.chatStream([{ role: 'user', content: 'b' }], { selection: { provider: 'openai-two222', model: 'm2' } }), 'due')
    assert.equal(one.requests.length, 1)
    assert.equal(two.requests.length, 1)
    assert.equal(one.requests[0].headers.authorization, undefined)
    assert.equal(two.requests[0].headers.authorization, 'Bearer chiave-due')
    assert.equal(one.requests[0].body.model, 'm1')
    assert.equal(two.requests[0].body.model, 'm2')

    const status = await ai.getStatus('openai-two222')
    assert.deepEqual([status.label, status.authenticated, status.configured], ['Xerj', true, true])
    assert.equal((await ai.getStatus('openai')).label, 'Locale')
    assert.deepEqual(await ai.getCapabilities('m2', 'openai-two222'), { known: true, vision: false, tools: true, pdf: false, detected: false })
  } finally { one.server.close(); two.server.close() }
})

test('più provider: togliere un server dalle impostazioni lo cancella, e la sua chiave non si usa più per un altro', async () => {
  const ai = providers()
  const base = ai.getSettings()
  ai.saveSettings({ ...base, aiEnabled: true, providers: { ...base.providers, 'openai-two222': { preset: 'custom', endpoint: 'http://127.0.0.1:9', model: 'm' } } })
  ai.saveApiKey('k', 'openai-two222')
  assert.equal(ai.hasApiKey('openai-two222'), true)
  const { 'openai-two222': removed, ...rest } = ai.getSettings().providers
  void removed
  ai.saveSettings({ ...ai.getSettings(), providers: rest })
  assert.equal('openai-two222' in ai.getSettings().providers, false)
  assert.equal(ai.hasApiKey('openai-two222'), false)
  await assert.rejects(() => ai.chatStream([{ role: 'user', content: 'x' }], { selection: { provider: 'openai-two222', model: 'm' } }).then(() => { throw new Error('non doveva partire') }), /Configure|Ollama|endpoint|ECONN|not reachable|Unknown/i)
})
