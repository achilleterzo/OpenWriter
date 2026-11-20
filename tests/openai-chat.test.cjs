const test = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const chat = require('../electron/openai-chat.cjs')
const { OPENAI_DESCRIPTORS } = require('../electron/provider-descriptors.cjs')
const { createAiProviders } = require('../electron/ai-providers.cjs')

const { openrouter, gemini } = OPENAI_DESCRIPTORS

// ---------- Codec: richiesta ----------

test('openai-chat: il corpo per OpenRouter ha usage, ragionamento in reasoning.effort e, con PDF, il plugin nativo', () => {
  const messages = [{ role: 'user', content: 'ciao' }]
  const { body, reasoning } = chat.buildRequest(openrouter, { model: 'm', messages, temperature: 0.4, numPredict: 256, level: 'high' })
  assert.deepEqual(body, { model: 'm', messages, temperature: 0.4, max_tokens: 256, usage: { include: true } })
  assert.deepEqual(reasoning, { reasoning: { effort: 'high' } })
  const withFile = [{ role: 'user', content: [{ type: 'text', text: 'x' }, { type: 'file', file: { filename: 'a.pdf', file_data: 'data:application/pdf;base64,AA' } }] }]
  assert.deepEqual(chat.buildRequest(openrouter, { model: 'm', messages: withFile }).body.plugins, [{ id: 'file-parser', pdf: { engine: 'native' } }])
})

test('openai-chat: il corpo per Gemini ha stream_options, reasoning_effort e nessun plugin PDF', () => {
  const withFile = [{ role: 'user', content: [{ type: 'file', file: {} }] }]
  const { body, reasoning } = chat.buildRequest(gemini, { model: 'g', messages: withFile, level: 'low' })
  assert.deepEqual(body, { model: 'g', messages: withFile, stream_options: { include_usage: true } })
  assert.deepEqual(reasoning, { reasoning_effort: 'low' })
})

test('openai-chat: con livello "default" o vuoto non si invia il ragionamento; temperatura e token vuoti non entrano nel corpo', () => {
  for (const level of ['default', '', undefined]) assert.deepEqual(chat.buildRequest(openrouter, { model: 'm', messages: [], level }).reasoning, {})
  const { body } = chat.buildRequest(gemini, { model: 'g', messages: [], temperature: '', numPredict: '' })
  assert.equal('temperature' in body, false)
  assert.equal('max_tokens' in body, false)
})

test('openai-chat: intestazioni con il token e quelle fisse del descrittore; senza token niente Authorization', () => {
  assert.deepEqual(chat.requestHeaders(openrouter, 'k'), { Accept: 'application/json', Authorization: 'Bearer k', 'X-Title': 'OpenWriter' })
  assert.deepEqual(chat.requestHeaders(gemini, ''), { Accept: 'application/json' })
})

test('openai-chat: i messaggi di Ollama diventano messaggi OpenAI (id alle chiamate, immagini e PDF in parti)', () => {
  const out = chat.toOpenAiMessages([
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'a.md' } } }] },
    { role: 'tool', tool_name: 'read_file', content: 'testo' },
    { role: 'tool', tool_name: 'orfano', content: 'senza chiamata' },
    { role: 'user', content: 'guarda', images: [{ mime: 'image/jpeg', data: 'QQ==' }] },
  ])
  assert.deepEqual(out[0], { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.md"}' } }] })
  assert.deepEqual(out[1], { role: 'tool', tool_call_id: 'call_1', content: 'testo' })
  assert.deepEqual(out[2], { role: 'user', content: '[Result of orfano]\nsenza chiamata' })
  assert.deepEqual(out[3].content, [{ type: 'text', text: 'guarda' }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,QQ==' } }])
})

test('openai-chat: l\'elenco modelli si ripulisce come dice il descrittore', () => {
  const data = { data: [{ id: 'models/gemini-2.5-pro' }, { id: 'models/gemini-embedding-001' }, { id: 'models/text-bison' }, { id: 'models/gemini-2.0-flash-image' }, {}] }
  assert.deepEqual(chat.parseModelIds(gemini, data), ['gemini-2.5-pro'])
  assert.deepEqual(chat.parseModelIds({ models: {} }, { data: [{ id: 'a' }, { id: 'b' }] }), ['a', 'b'])
})

// ---------- Codec: risposta ----------

function parse(chunks) {
  const events = []
  const errors = []
  const parser = chat.createStreamParser({ onEvent: (event) => events.push(event), onError: (error) => errors.push(error) })
  for (const chunk of chunks) parser.push(chunk)
  return { events, errors, parser, text: parser.finish() }
}

test('openai-chat: testo, ragionamento e token dello stream', () => {
  const { events, text, parser } = parse([
    { choices: [{ delta: { reasoning: 'penso' } }] },
    { choices: [{ delta: { content: 'Ci' } }] },
    { choices: [{ delta: { content: 'ao' } }] },
    { usage: { prompt_tokens: 10, completion_tokens: 3 } },
  ])
  assert.equal(text, 'Ciao')
  assert.equal(parser.emitted, true)
  assert.deepEqual(events.map((event) => event.type), ['thinking', 'text', 'text', 'usage'])
  assert.deepEqual(events.at(-1), { type: 'usage', input: 10, output: 3 })
})

test('openai-chat: la chiamata a uno strumento arriva a pezzi e diventa un blocco <tool_call> dopo il testo', () => {
  const { text } = parse([
    { choices: [{ delta: { content: 'Leggo.' } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_file', arguments: '{"pa' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'th":"a.md"}' } }] } }] },
  ])
  assert.equal(text, 'Leggo.\n<tool_call>{"name":"read_file","arguments":{"path":"a.md"}}</tool_call>')
})

test('openai-chat: chiamate parallele tutte con indice 0 (Gemini) o con indici successivi: resta solo la prima', () => {
  const sameIndex = parse([
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'a', arguments: '{"x":1}' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'b', arguments: '{"y":2}' } }] } }] },
  ])
  assert.equal(sameIndex.text, '<tool_call>{"name":"a","arguments":{"x":1}}</tool_call>')
  const nextIndex = parse([
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'a', arguments: '{}' } }, { index: 1, function: { name: 'b', arguments: '{}' } }] } }] },
  ])
  assert.equal(nextIndex.text, '<tool_call>{"name":"a","arguments":{}}</tool_call>')
})

test('openai-chat: argomenti non validi diventano un oggetto vuoto', () => {
  assert.equal(parse([{ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'a', arguments: '{rotto' } }] } }] }]).text, '<tool_call>{"name":"a","arguments":{}}</tool_call>')
})

test('openai-chat: un errore dentro lo stream interrompe, si registra ed è ritentabile', () => {
  const errors = []
  const parser = chat.createStreamParser({ onEvent: () => {}, onError: (error) => errors.push(error) })
  assert.throws(() => parser.push({ error: { message: 'upstream giù' }, provider: 'Acme' }), (error) => {
    assert.equal(error.message, 'upstream giù (Acme)')
    assert.equal(error.fatal, true)
    assert.equal(chat.isTransient(error), true)
    return true
  })
  assert.equal(errors.length, 1)
  assert.equal(chat.isTransient({ httpStatus: 429 }), true)
  assert.equal(chat.isTransient({ httpStatus: 400 }), false)
})

// ---------- Dall'inizio alla fine, con un server finto ----------

// Server SSE: `handler(body, request)` restituisce { status, chunks } per ogni richiesta; registra corpo e intestazioni.
function fakeService(handler) {
  const requests = []
  const server = http.createServer((request, response) => {
    let raw = ''
    request.on('data', (piece) => { raw += piece })
    request.on('end', () => {
      const body = raw ? JSON.parse(raw) : null
      requests.push({ url: request.url, headers: request.headers, body })
      const { status = 200, chunks = [], error } = handler(body, requests.length)
      if (status !== 200) {
        response.writeHead(status, { 'Content-Type': 'application/json' })
        return response.end(JSON.stringify({ error: { message: error || 'errore' } }))
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const chunk of chunks) response.write(`data: ${JSON.stringify(chunk)}\n\n`)
      response.end('data: [DONE]\n\n')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, url: `http://127.0.0.1:${server.address().port}` })))
}

function providersFor(service, provider, settings = {}) {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ow-chat-'))
  const app = { getPath: () => userData, getVersion: () => '0.0.0' }
  const safeStorage = { isEncryptionAvailable: () => true, encryptString: (value) => Buffer.from(value), decryptString: (buffer) => buffer.toString() }
  const descriptors = { openrouter: { ...openrouter, baseUrl: service.url }, gemini: { ...gemini, baseUrl: service.url } }
  const ai = createAiProviders({ app, safeStorage, descriptors })
  const base = ai.getSettings()
  ai.saveSettings({ ...base, aiEnabled: true, provider, providers: { ...base.providers, [provider]: { ...base.providers[provider], model: 'm', reasoning: 'high', ...settings } } })
  ai.saveApiKey('segreto', provider)
  return ai
}

const ok = (text) => ({ chunks: [{ choices: [{ delta: { content: text } }] }, { usage: { prompt_tokens: 5, completion_tokens: 2 } }] })

test('openai-chat (completo): OpenRouter riceve token, X-Title, usage e ragionamento; la risposta torna intera', async () => {
  const service = await fakeService(() => ok('Ciao'))
  try {
    const ai = providersFor(service, 'openrouter')
    const events = []
    const reply = await ai.chatStream([{ role: 'user', content: 'salve' }], { onEvent: (event) => events.push(event) })
    assert.equal(reply, 'Ciao')
    const [request] = service.requests
    assert.equal(request.url, '/chat/completions')
    assert.equal(request.headers.authorization, 'Bearer segreto')
    assert.equal(request.headers['x-title'], 'OpenWriter')
    assert.deepEqual(request.body, { model: 'm', messages: [{ role: 'user', content: 'salve' }], usage: { include: true }, reasoning: { effort: 'high' }, stream: true })
    assert.deepEqual(events.at(-1), { type: 'usage', input: 5, output: 2 })
  } finally { service.server.close() }
})

test('openai-chat (completo): Gemini usa reasoning_effort e stream_options, senza X-Title', async () => {
  const service = await fakeService(() => ok('Hi'))
  try {
    const ai = providersFor(service, 'gemini')
    await ai.chatStream([{ role: 'user', content: 'hi' }])
    const [request] = service.requests
    assert.equal(request.headers['x-title'], undefined)
    assert.deepEqual(request.body, { model: 'm', messages: [{ role: 'user', content: 'hi' }], stream_options: { include_usage: true }, reasoning_effort: 'high', stream: true })
  } finally { service.server.close() }
})

test('openai-chat (completo): se il modello rifiuta il ragionamento (400) si riprova senza, per qualunque forma del parametro', async () => {
  for (const provider of ['openrouter', 'gemini']) {
    const service = await fakeService((body) => (body.reasoning || body.reasoning_effort ? { status: 400, error: 'parametro non supportato' } : ok('senza')))
    try {
      const ai = providersFor(service, provider)
      assert.equal(await ai.chatStream([{ role: 'user', content: 'x' }]), 'senza')
      assert.equal(service.requests.length, 2, provider)
      assert.equal(service.requests[1].body.reasoning, undefined)
      assert.equal(service.requests[1].body.reasoning_effort, undefined)
    } finally { service.server.close() }
  }
})

test('openai-chat (completo): una chiamata a uno strumento torna come blocco <tool_call>', async () => {
  const service = await fakeService(() => ({ chunks: [{ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'read_file', arguments: '{"path":"a.md"}' } }] } }] }] }))
  try {
    const ai = providersFor(service, 'openrouter', { reasoning: 'default' })
    const reply = await ai.chatStream([{ role: 'user', content: 'leggi' }], { tools: [{ type: 'function', function: { name: 'read_file' } }] })
    assert.equal(reply, '<tool_call>{"name":"read_file","arguments":{"path":"a.md"}}</tool_call>')
    assert.equal(service.requests[0].body.tools.length, 1)
  } finally { service.server.close() }
})

test('openai-chat (completo): se nessun endpoint accetta gli strumenti (404) l\'errore chiede il formato testuale', async () => {
  const service = await fakeService(() => ({ status: 404, error: 'no tools' }))
  try {
    const ai = providersFor(service, 'openrouter', { reasoning: 'default' })
    await assert.rejects(() => ai.chatStream([{ role: 'user', content: 'x' }], { tools: [{ type: 'function', function: { name: 'f' } }] }), /TOOLS_UNSUPPORTED/)
  } finally { service.server.close() }
})

test('openai-chat (completo): l\'elenco modelli usa il token e il filtro del descrittore; le capacità vengono dal descrittore', async () => {
  const service = await fakeService(() => ({ chunks: [] }))
  service.server.removeAllListeners('request')
  service.server.on('request', (request, response) => {
    service.requests.push({ url: request.url, headers: request.headers })
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ data: [{ id: 'models/gemini-2.5-pro' }, { id: 'models/gemini-embedding-001' }, { id: 'models/altro' }] }))
  })
  try {
    const ai = providersFor(service, 'gemini')
    assert.deepEqual(await ai.listModels({ provider: 'gemini' }), ['gemini-2.5-pro'])
    assert.equal(service.requests[0].url, '/models')
    assert.equal(service.requests[0].headers.authorization, 'Bearer segreto')
    assert.deepEqual(await ai.getCapabilities('gemini-2.5-pro', 'gemini'), { known: true, vision: true, tools: true, pdf: false })
  } finally { service.server.close() }
})
