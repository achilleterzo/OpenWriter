const crypto = require('node:crypto')
const fs = require('node:fs')
const http = require('node:http')
const path = require('node:path')

/**
 * Il contesto per la scheda video: WebGPU esiste solo dentro Chromium, non nei thread di Node, quindi i vettori della GPU si calcolano in una finestra
 * nascosta (electron/gpu-embedder/) che carica il modello fp16 del pacchetto GPU (semantic-pack.cjs) con onnxruntime-web. Il processo principale le manda
 * i testi e riceve i vettori; l'indice (thread a parte) li chiede al processo principale (vedi knowledge-service.cjs).
 *
 * La pagina e i file del pacchetto si servono da un piccolo server HTTP sul solo indirizzo locale, con un percorso segreto per ogni avvio: i moduli
 * ES e il caricamento di un modello da 235 MB non funzionano bene da file://. La finestra non ha accesso a Node, non può aprire altre finestre né
 * navigare altrove, non ha permessi e ha una politica di sicurezza dei contenuti che ammette solo ciò che serve.
 *
 * La finestra nasce alla prima richiesta e si chiude da sola dopo `idleMs` senza lavoro (libera la memoria della scheda).
 */
const REQUEST_TIMEOUT_MS = 180_000
const READY_TIMEOUT_MS = 30_000

function createGpuContext({ BrowserWindow, ipcMain, packDirectory, tokenizersFile, idleMs = 120_000 }) {
  const pageDirectory = path.join(__dirname, 'gpu-embedder')
  let server = null
  let token = ''
  let window = null
  let starting = null
  let idleTimer = null
  let counter = 0
  const pending = new Map()
  const PACK_NAME = /^[A-Za-z0-9._-]+$/

  const routes = () => ({
    '': { file: path.join(pageDirectory, 'index.html'), type: 'text/html; charset=utf-8' },
    'page.mjs': { file: path.join(pageDirectory, 'page.mjs'), type: 'text/javascript; charset=utf-8' },
    'vendor/tokenizers.mjs': { file: tokenizersFile(), type: 'text/javascript; charset=utf-8' },
  })

  function startServer() {
    if (server) return Promise.resolve()
    token = crypto.randomBytes(16).toString('hex')
    server = http.createServer((request, response) => {
      const [pathname] = String(request.url || '').split('?')
      const prefix = `/${token}/`
      if (request.method !== 'GET' || !pathname.startsWith(prefix)) { response.writeHead(404); response.end(); return }
      const name = decodeURIComponent(pathname.slice(prefix.length))
      let file = null
      let type = 'application/octet-stream'
      if (name.startsWith('pack/')) {
        const base = name.slice(5)
        if (PACK_NAME.test(base)) {
          file = path.join(packDirectory(), base)
          type = base.endsWith('.wasm') ? 'application/wasm' : base.endsWith('.json') ? 'application/json' : base.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'application/octet-stream'
        }
      } else {
        const route = routes()[name]
        if (route) { file = route.file; type = route.type }
      }
      if (!file || !fs.existsSync(file)) { response.writeHead(404); response.end(); return }
      response.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self' blob:; style-src 'unsafe-inline'; img-src 'none'",
      })
      fs.createReadStream(file).on('error', () => response.destroy()).pipe(response)
    })
    return new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
  }

  function onReply(event, id, payload) {
    if (!window || event.sender !== window.webContents) return // solo la nostra finestra
    if (id === 0) { if (payload?.ready) readyResolve?.(); return }
    const entry = pending.get(id)
    if (!entry) return
    pending.delete(id)
    clearTimeout(entry.timer)
    touch()
    if (payload?.error) entry.reject(new Error(payload.error)); else entry.resolve(payload)
  }
  let readyResolve = null
  let listening = false

  function failAll(error) {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(error) }
    pending.clear()
  }

  async function ensureWindow() {
    if (window && !window.isDestroyed()) return
    if (starting) return starting
    starting = (async () => {
      await startServer()
      if (!listening) { ipcMain.on('embed:reply', onReply); listening = true }
      const created = new BrowserWindow({
        show: false,
        width: 400,
        height: 300,
        webPreferences: {
          preload: path.join(pageDirectory, 'preload.cjs'),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          backgroundThrottling: false,
          partition: 'ow-embedder',
          webSecurity: true,
        },
      })
      window = created
      created.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      created.webContents.on('will-navigate', (event) => event.preventDefault())
      created.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
      created.webContents.on('render-process-gone', (_event, details) => { failAll(new Error(`The GPU page stopped (${details.reason})`)); if (window === created) window = null })
      created.on('closed', () => { if (window === created) window = null })
      const ready = new Promise((resolve, reject) => {
        readyResolve = resolve
        setTimeout(() => reject(new Error('The GPU page did not start in time')), READY_TIMEOUT_MS)
      })
      await created.loadURL(`http://127.0.0.1:${server.address().port}/${token}/`)
      await ready
    })().finally(() => { starting = null })
    return starting
  }

  function touch() {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { if (pending.size) touch(); else closeWindow() }, idleMs)
    idleTimer.unref?.()
  }

  async function request(message) {
    try { await ensureWindow() } catch (error) { closeWindow(); throw error }
    touch()
    return new Promise((resolve, reject) => {
      counter += 1
      const id = counter
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('The GPU did not answer in time')) }, REQUEST_TIMEOUT_MS)
      pending.set(id, { resolve, reject, timer })
      window.webContents.send('embed:request', { id, ...message })
    })
  }

  function closeWindow() {
    clearTimeout(idleTimer)
    failAll(new Error('The GPU context was closed'))
    const current = window
    window = null
    try { if (current && !current.isDestroyed()) current.destroy() } catch { /* già chiusa */ }
  }

  return {
    // Descrizione della scheda che WebGPU userebbe: { webgpu, vendor, architecture, device, description, fp16 } oppure { webgpu: false, reason }. Non carica il modello.
    async probe() { return (await request({ op: 'probe' })).info },
    // Vettori normalizzati (Float32Array) per i testi; `kind`: 'passage' o 'query'. Carica il modello alla prima chiamata.
    async embed(texts, kind = 'passage') {
      const { vectors } = await request({ op: 'embed', texts, kind })
      return vectors.map((vector) => (vector instanceof Float32Array ? vector : new Float32Array(vector)))
    },
    // Libera la finestra e la memoria della scheda (si ricrea alla prossima richiesta).
    release: closeWindow,
    async close() {
      closeWindow()
      if (listening) { ipcMain.removeListener('embed:reply', onReply); listening = false }
      const current = server
      server = null
      if (current) await new Promise((resolve) => current.close(resolve))
    },
  }
}

module.exports = { createGpuContext }
