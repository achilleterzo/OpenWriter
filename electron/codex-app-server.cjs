const { spawn } = require('node:child_process')

class CodexAppServer {
  constructor() {
    this.child = null
    this.buffer = ''
    this.nextRequestId = 1
    this.pending = new Map()
    this.status = {
      state: 'disconnected',
      executable: 'codex',
      codexHome: null,
      platformFamily: null,
      platformOs: null,
      error: null,
    }
    this.statusListeners = new Set()
    this.logListeners = new Set()
  }

  onStatus(listener) {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  getStatus() {
    return { ...this.status }
  }

  onLog(listener) {
    this.logListeners.add(listener)
    return () => this.logListeners.delete(listener)
  }

  log(message) {
    for (const listener of this.logListeners) listener(message)
  }

  updateStatus(values) {
    this.status = { ...this.status, ...values }
    for (const listener of this.statusListeners) listener(this.getStatus())
  }

  async connect(executable = 'codex') {
    await this.disconnect()
    this.buffer = ''
    this.updateStatus({ state: 'connecting', executable, error: null })

    this.child = spawn(executable, ['app-server', '--stdio'], {
      shell: process.platform === 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stderr.setEncoding('utf8')
    this.child.stdout.on('data', (chunk) => this.handleOutput(chunk))
    this.child.stderr.on('data', (chunk) => {
      const error = chunk.trim()
      if (error) {
        this.log(`[stderr] ${error}`)
        this.updateStatus({ error })
      }
    })
    this.child.on('error', (error) => {
      this.rejectPending(error)
      this.updateStatus({ state: 'error', error: error.message })
    })
    this.child.on('exit', (code, signal) => {
      if (this.child) this.updateStatus({ state: 'disconnected', error: `Codex terminato (${code ?? signal})` })
      this.child = null
    })

    try {
      const result = await this.request('initialize', {
        clientInfo: {
          name: 'openwriter',
          title: 'OpenWriter',
          version: '0.1.0',
        },
        capabilities: {
          experimentalApi: true,
        },
      })
      this.notify('initialized')
      this.updateStatus({
        state: 'connected',
        codexHome: result?.codexHome ?? null,
        platformFamily: result?.platformFamily ?? null,
        platformOs: result?.platformOs ?? null,
        error: null,
      })
      return this.getStatus()
    } catch (error) {
      await this.disconnect()
      this.updateStatus({ state: 'error', error: error.message })
      throw error
    }
  }

  async disconnect() {
    if (!this.child) return
    const child = this.child
    this.child = null
    this.rejectPending(new Error('Connessione Codex chiusa'))
    child.kill()
    this.updateStatus({ state: 'disconnected' })
  }

  request(method, params = {}) {
    if (!this.child?.stdin.writable) return Promise.reject(new Error('Codex app-server non connesso'))

    const id = this.nextRequestId++
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(`${JSON.stringify({ method, id, params })}\n`)
    })
  }

  notify(method, params = {}) {
    if (this.child?.stdin.writable) this.child.stdin.write(`${JSON.stringify({ method, params })}\n`)
  }

  handleOutput(chunk) {
    this.buffer += chunk
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      this.log(`[app-server] ${line}`)
      try {
        const message = JSON.parse(line)
        if (message.id !== undefined && this.pending.has(message.id)) {
          const pending = this.pending.get(message.id)
          this.pending.delete(message.id)
          if (message.error) pending.reject(new Error(message.error.message || 'Errore JSON-RPC'))
          else pending.resolve(message.result)
        }
      } catch (error) {
        this.updateStatus({ error: `Risposta app-server non valida: ${error.message}` })
      }
    }
  }

  rejectPending(error) {
    for (const { reject } of this.pending.values()) reject(error)
    this.pending.clear()
  }
}

module.exports = { CodexAppServer }
