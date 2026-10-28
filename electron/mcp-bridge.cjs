const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')
const { writeFileAtomic } = require('./atomic-write.cjs')
const { samePath } = require('./path-compare.cjs')

/**
 * Ponte tra il server MCP (un altro processo, avviato dall'agente) e l'app aperta: serve a far modificare i documenti aperti nell'editor,
 * così le modifiche arrivano come "da rivedere" (accetta/rifiuta) invece di toccare il file.
 *
 * L'app ascolta solo su 127.0.0.1, su una porta casuale, e scrive porta e token in `mcp-bridge.json` nei propri dati (leggibile solo dall'utente).
 * Il server MCP legge quel file e chiama POST /call con il token. Ogni richiesta passa all'interfaccia (renderer), che esegue lo strumento
 * sull'editor e risponde. Si accettano solo gli strumenti elencati in ALLOWED e solo per il progetto aperto nell'app.
 */
const ALLOWED = new Set(['read_open_document', 'replace_text', 'insert_text', 'replace_document', 'open_document', 'open_project', 'ask_agent', 'dirty_documents'])
// Strumenti che non dipendono dal progetto aperto nell'app (anzi, lo cambiano).
const ANY_PROJECT = new Set(['open_project'])
const MAX_BODY_BYTES = 8 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 120_000

function createMcpBridge({ directory, getWindow, getProjectPath, isEnabled = () => true }) {
  const bridgeFile = path.join(directory, 'mcp-bridge.json')
  const token = crypto.randomBytes(24).toString('hex')
  const pending = new Map()
  let counter = 0
  let server = null
  let queue = Promise.resolve()

  const sameProject = samePath

  // Una richiesta alla volta: due modifiche dello stesso documento non si sovrappongono.
  function dispatch(tool, args) {
    const run = () => new Promise((resolve, reject) => {
      const window = getWindow()
      if (!window || window.isDestroyed()) { reject(new Error('The OpenWriter window is not available')); return }
      counter += 1
      const id = counter
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('OpenWriter did not answer in time')) }, REQUEST_TIMEOUT_MS)
      pending.set(id, { resolve, reject, timer })
      window.webContents.send('mcp:request', { id, tool, args })
    })
    const result = queue.then(run, run)
    queue = result.catch(() => {})
    return result
  }

  // Risposta dell'interfaccia: { ok, text } oppure { ok: false, error }.
  function answer(id, payload) {
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    clearTimeout(entry.timer)
    if (payload && payload.ok) entry.resolve(String(payload.text ?? ''))
    else entry.reject(new Error(String(payload?.error || 'The request failed')))
  }

  function rejectAll(reason) {
    for (const [id, entry] of pending) { clearTimeout(entry.timer); entry.reject(new Error(reason)) }
    pending.clear()
  }

  const reply = (response, status, body) => {
    const text = JSON.stringify(body)
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text), 'Cache-Control': 'no-store' })
    response.end(text)
  }

  async function onRequest(request, response) {
    // Solo chiamate dirette del server MCP: niente pagine web (Origin) e solo il nostro indirizzo (contro il DNS rebinding).
    const port = server.address().port
    if (request.headers.origin || ![`127.0.0.1:${port}`, `localhost:${port}`].includes(String(request.headers.host || '').toLowerCase())) { reply(response, 403, { ok: false, error: 'Forbidden' }); return }
    const given = String(request.headers.authorization || '')
    const expected = `Bearer ${token}`
    if (given.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) { reply(response, 401, { ok: false, error: 'Unauthorized' }); return }
    if (request.method !== 'POST' || request.url !== '/call') { reply(response, 404, { ok: false, error: 'Not found' }); return }

    let body = ''
    let size = 0
    for await (const chunk of request) {
      size += chunk.length
      if (size > MAX_BODY_BYTES) { reply(response, 413, { ok: false, error: 'The request is too large' }); return }
      body += chunk
    }
    let message
    try { message = JSON.parse(body) } catch { reply(response, 400, { ok: false, error: 'Invalid JSON' }); return }
    if (!ALLOWED.has(message.tool)) { reply(response, 400, { ok: false, error: `Unknown tool: ${message.tool}` }); return }
    if (!isEnabled()) { reply(response, 403, { ok: false, error: 'Editing by agents is turned off in OpenWriter (Settings > Agents (MCP))' }); return }
    const open = getProjectPath()
    if (!open && !ANY_PROJECT.has(message.tool)) { reply(response, 409, { ok: false, error: 'No project is open in OpenWriter' }); return }
    if (!ANY_PROJECT.has(message.tool) && !sameProject(message.project, open)) { reply(response, 409, { ok: false, error: `The project open in OpenWriter is "${open}", not the one this agent is working on: open the right project in OpenWriter first` }); return }
    try {
      const text = await dispatch(message.tool, message.arguments && typeof message.arguments === 'object' ? message.arguments : {})
      reply(response, 200, { ok: true, text })
    } catch (error) {
      reply(response, 200, { ok: false, error: error.message })
    }
  }

  function start() {
    return new Promise((resolve) => {
      server = http.createServer((request, response) => { onRequest(request, response).catch((error) => { try { reply(response, 500, { ok: false, error: error.message }) } catch { /* connessione chiusa */ } }) })
      server.on('error', (error) => { console.error('Ponte MCP non avviato:', error.message); resolve(false) })
      server.listen(0, '127.0.0.1', () => {
        try {
          fs.mkdirSync(directory, { recursive: true })
          writeFileAtomic(bridgeFile, JSON.stringify({ port: server.address().port, token, pid: process.pid, startedAt: new Date().toISOString() }), { mode: 0o600 })
          try { fs.chmodSync(bridgeFile, 0o600) } catch { /* su Windows vale la sicurezza della cartella dell'utente */ }
          resolve(true)
        } catch (error) {
          console.error('Ponte MCP: file non scritto:', error.message)
          resolve(false)
        }
      })
    })
  }

  function stop() {
    rejectAll('OpenWriter is closing')
    try { server?.close() } catch { /* già chiuso */ }
    server = null
    // Il file si toglie solo se è ancora il nostro (un'altra istanza dell'app potrebbe averlo riscritto).
    try { if (JSON.parse(fs.readFileSync(bridgeFile, 'utf8')).pid === process.pid) fs.rmSync(bridgeFile, { force: true }) } catch { /* niente da togliere */ }
  }

  return { start, stop, answer, rejectAll, bridgeFile }
}

module.exports = { createMcpBridge, ALLOWED }
