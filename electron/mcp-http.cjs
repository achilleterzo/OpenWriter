const crypto = require('node:crypto')
const fs = require('node:fs')
const net = require('node:net')
const path = require('node:path')
const { spawn } = require('node:child_process')
const { writeFileAtomic } = require('./atomic-write.cjs')

/**
 * Trasporto HTTP del server MCP per i client che non possono avviare un processo (vedi mcp-server.cjs, opzione --http).
 * Lo avvia l'app, come processo figlio, solo se l'utente lo attiva dalle impostazioni (Agenti (MCP)). Ascolta solo su 127.0.0.1.
 * Porta e token stanno in `mcp-http.json` nei dati dell'app (leggibile solo dall'utente) e restano gli stessi tra un avvio e l'altro,
 * così la configurazione del client non cambia; il token si può rigenerare.
 */
function createMcpHttp({ directory, serverPath, packaged, execPath }) {
  const stateFile = path.join(directory, 'mcp-http.json')
  let child = null
  let lastError = ''
  let running = null

  function readState() {
    try {
      const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'))
      if (Number.isInteger(state.port) && typeof state.token === 'string' && state.token.length >= 16) return state
    } catch { /* primo avvio */ }
    return null
  }

  function writeState(state) {
    fs.mkdirSync(directory, { recursive: true })
    writeFileAtomic(stateFile, JSON.stringify(state))
    try { fs.chmodSync(stateFile, 0o600) } catch { /* su Windows vale la sicurezza della cartella dell'utente */ }
  }

  const freePort = () => new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.on('error', reject)
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)) })
  })

  const newToken = () => crypto.randomBytes(24).toString('hex')

  async function ensureState({ renewToken = false } = {}) {
    let state = readState()
    if (!state) state = { port: await freePort(), token: newToken() }
    else if (renewToken) state = { ...state, token: newToken() }
    writeState(state)
    return state
  }

  function status() {
    const state = readState()
    return { running: Boolean(running), error: lastError, ...(state ? { port: state.port, token: state.token, url: `http://127.0.0.1:${state.port}/mcp` } : {}) }
  }

  // Gli avvii si accodano e ogni richiesta (avvio o arresto) invalida le precedenti: un avvio superato non lancia più nulla, quindi non resta
  // mai un server (magari scrivibile) che `stop()` non conosce. Prima di lanciare il nuovo si attende l'uscita del vecchio, che libera la porta.
  let generation = 0
  let queue = Promise.resolve()
  let exiting = Promise.resolve()

  // Avvia (o riavvia) il server; risolve quando ha scritto di essere in ascolto o è terminato.
  function start(options = {}) {
    const mine = ++generation
    const result = queue.then(() => launch(options, mine))
    queue = result.catch(() => {})
    return result
  }

  async function launch({ readOnly = false, renewToken = false }, mine) {
    terminate()
    await exiting
    if (mine !== generation) return status()
    lastError = ''
    const state = await ensureState({ renewToken })
    if (mine !== generation) return status()
    const args = [serverPath, '--http', '--port', String(state.port), '--token', state.token, '--data', directory, ...(readOnly ? ['--read-only'] : [])]
    const process_ = spawn(packaged ? execPath : 'node', args, { cwd: directory, env: { ...process.env, ...(packaged ? { ELECTRON_RUN_AS_NODE: '1' } : {}) }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    child = process_
    await new Promise((resolve) => {
      let settled = false
      const done = () => { if (!settled) { settled = true; resolve() } }
      process_.stderr.on('data', (chunk) => {
        const text = String(chunk)
        if (text.includes('HTTP listening')) { running = process_; done() }
        else if (/error|required/i.test(text) && !text.includes('uncaught')) lastError = text.trim().slice(0, 300)
      })
      process_.on('error', (error) => { lastError = error.message; done() })
      process_.on('exit', (code) => {
        if (running === process_) running = null
        if (child === process_) child = null
        if (!lastError && code) lastError = `The server stopped (code ${code})`
        done()
      })
      setTimeout(done, 5000)
    })
    return status()
  }

  function terminate() {
    const current = child
    child = null
    running = null
    if (!current) return
    if (current.exitCode === null && current.signalCode === null) exiting = Promise.all([exiting, new Promise((resolve) => { current.once('exit', resolve); setTimeout(resolve, 3000).unref?.() })])
    try { current.kill() } catch { /* già terminato */ }
  }

  function stop() {
    generation += 1
    terminate()
  }

  return { start, stop, status }
}

module.exports = { createMcpHttp }
