// Codec del protocollo "openai-chat": POST {baseUrl}/chat/completions con risposta in streaming SSE.
// Funzioni pure, senza Electron e senza nomi di provider: le differenze tra i servizi stanno nei descrittori (provider-descriptors.cjs)
// e le stranezze delle risposte (chiamate parallele tutte con indice 0, errori dentro lo stream) sono regole di lettura valide per tutti.

// Errori temporanei (limiti di frequenza, servizio a monte non disponibile): si ritenta con attese crescenti.
const TRANSIENT_STATUSES = [408, 429, 500, 502, 503, 504]
const RETRY_DELAYS_MS = [1500, 4000]
const isTransient = (error) => Boolean(error?.streamError || TRANSIENT_STATUSES.includes(error?.httpStatus))

// Imposta un valore in un oggetto dato un percorso a punti ("reasoning.effort").
function setPath(target, path, value) {
  const keys = String(path).split('.')
  let node = target
  for (const key of keys.slice(0, -1)) node = node[key] ??= {}
  node[keys.at(-1)] = value
  return target
}

// Intestazioni di una richiesta: Accept, il token Bearer se c'è e quelle fisse del descrittore.
function requestHeaders(descriptor, key = '') {
  return { Accept: 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}), ...(descriptor.headers || {}) }
}

const hasFileParts = (messages) => messages.some((message) => Array.isArray(message.content) && message.content.some((part) => part.type === 'file'))

// Corpo della richiesta. `body` va sempre; `reasoning` è a parte perché, se il modello lo rifiuta (400), si ritenta senza.
function buildRequest(descriptor, { model, messages, temperature = '', numPredict = '', level = '' }) {
  const params = {
    ...(temperature !== '' ? { temperature } : {}),
    ...(numPredict !== '' && numPredict != null ? { max_tokens: numPredict } : {}),
  }
  const files = descriptor.whenFiles && hasFileParts(messages) ? structuredClone(descriptor.whenFiles) : {}
  const usage = descriptor.usage ? structuredClone(descriptor.usage) : {}
  const effort = level && level !== 'default' ? level : ''
  const reasoning = effort && descriptor.reasoningParam ? setPath({}, descriptor.reasoningParam, effort) : {}
  return { body: { model, messages, ...params, ...files, ...usage }, reasoning }
}

// Messaggi nel formato OpenAI. In ingresso hanno il formato di Ollama: le chiamate agli strumenti non hanno id e i risultati
// sono legati per nome (tool_name), quindi si assegna un id a ogni chiamata e lo si riporta nel risultato che la segue.
// Le immagini diventano parti "image_url" con un data URI, i PDF parti "file".
function toOpenAiMessages(list) {
  let pendingCall = null
  let counter = 0
  return list.map((message) => {
    if (message.role === 'tool') {
      const call = pendingCall
      pendingCall = null
      if (call) return { role: 'tool', tool_call_id: call, content: message.content }
      return { role: 'user', content: `[Result of ${message.tool_name || 'tool'}]\n${message.content}` }
    }
    if (message.role === 'assistant' && message.tool_calls?.length) {
      const calls = message.tool_calls.map((call) => {
        const args = call?.function?.arguments
        return { id: `call_${++counter}`, type: 'function', function: { name: String(call?.function?.name || ''), arguments: typeof args === 'string' ? args : JSON.stringify(args ?? {}) } }
      })
      pendingCall = calls[0].id
      return { role: 'assistant', content: message.content || null, tool_calls: calls }
    }
    if (message.images?.length || message.files?.length) {
      return {
        role: message.role,
        content: [
          ...(message.content ? [{ type: 'text', text: message.content }] : []),
          ...(message.images || []).map((image) => ({ type: 'image_url', image_url: { url: `data:${image.mime || 'image/png'};base64,${image.data}` } })),
          ...(message.files || []).map((file) => ({ type: 'file', file: { filename: file.name, file_data: `data:${file.mime};base64,${file.data}` } })),
        ],
      }
    }
    return { role: message.role, content: message.content }
  })
}

// Lettura di uno stream di risposta, un oggetto JSON alla volta (`push`): testo in delta.content, ragionamento in delta.reasoning,
// chiamate agli strumenti in delta.tool_calls a pezzi (nome e argomenti JSON da ricomporre), token nel blocco `usage`.
// A fine stream (`finish`) la chiamata diventa un blocco <tool_call> nel testo, come per gli altri provider. Una sola chiamata per messaggio.
function createStreamParser({ onEvent, onError = () => {} }) {
  let text = ''
  let call = null
  let emitted = false
  return {
    // Vero se è già arrivato del testo o del ragionamento: da quel punto una richiesta non si può rifare senza duplicare ciò che l'utente ha visto.
    get emitted() { return emitted },
    push(chunk) {
      // Errore arrivato dentro lo stream (la risposta HTTP era già 200): di solito il servizio a monte ha fallito.
      if (chunk.error) {
        onError(chunk.error)
        const upstream = chunk.provider ? ` (${chunk.provider})` : ''
        throw Object.assign(new Error(`${String(chunk.error.message || chunk.error)}${upstream}`), { fatal: true, streamError: true })
      }
      // L'ultimo blocco (spesso senza `choices`) riporta i token consumati.
      if (chunk.usage) onEvent({ type: 'usage', input: Number(chunk.usage.prompt_tokens) || 0, output: Number(chunk.usage.completion_tokens) || 0 })
      const delta = chunk.choices?.[0]?.delta
      if (!delta) return
      if (delta.reasoning) { emitted = true; onEvent({ type: 'thinking', delta: delta.reasoning }) }
      if (delta.content) { emitted = true; text += delta.content; onEvent({ type: 'text', delta: delta.content }) }
      for (const part of delta.tool_calls || []) {
        if ((part.index ?? 0) !== 0 || call?.done) continue
        // Alcuni servizi numerano tutte le chiamate parallele con indice 0: un secondo nome chiude la prima chiamata, le altre si ignorano.
        if (part.function?.name && call?.name) { call.done = true; continue }
        call ??= { name: '', arguments: '' }
        if (part.function?.name) call.name += part.function.name
        if (part.function?.arguments) call.arguments += part.function.arguments
      }
    },
    finish() {
      if (call?.name) {
        let args = {}
        try { args = call.arguments.trim() ? JSON.parse(call.arguments) : {} } catch { args = {} }
        const block = `${text && !text.endsWith('\n') ? '\n' : ''}<tool_call>${JSON.stringify({ name: call.name, arguments: args })}</tool_call>`
        text += block
        onEvent({ type: 'text', delta: block })
      }
      return text
    },
  }
}

// Id dei modelli da una risposta di /models ({ data: [{ id }] }), puliti secondo il descrittore. Con `catalog` si restituiscono tutti.
function parseModelIds(descriptor, data) {
  const rule = descriptor.models || {}
  const strip = rule.stripPrefix ? new RegExp(rule.stripPrefix) : null
  const include = rule.include ? new RegExp(rule.include) : null
  const exclude = rule.exclude ? new RegExp(rule.exclude) : null
  return (Array.isArray(data?.data) ? data.data : [])
    .map((model) => String(model?.id || ''))
    .map((id) => (strip ? id.replace(strip, '') : id))
    .filter((id) => id && (!include || include.test(id)) && (!exclude || !exclude.test(id)))
}

module.exports = { TRANSIENT_STATUSES, RETRY_DELAYS_MS, isTransient, setPath, requestHeaders, buildRequest, toOpenAiMessages, createStreamParser, parseModelIds }
