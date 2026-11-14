/**
 * Client MCP: si collega ai server (processo figlio via stdio, oppure HTTP), li avvia al primo uso e li chiude all'uscita.
 * Non sa nulla di progetti né di fiducia: riceve un server già pronto (vedi mcp-servers-store.cjs → active) e lo usa.
 */
const CONNECT_TIMEOUT_MS = 20000
const CALL_TIMEOUT_MS = 60000
const MAX_TOOL_PAGES = 5

// L'SDK è in ESM/CJS e pesa: si carica al primo collegamento, non all'avvio dell'app.
let sdk = null
function loadSdk() {
  if (!sdk) {
    sdk = {
      Client: require('@modelcontextprotocol/sdk/client/index.js').Client,
      stdio: require('@modelcontextprotocol/sdk/client/stdio.js'),
      http: require('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport,
    }
  }
  return sdk
}

const withTimeout = (promise, milliseconds, message) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error(message)), milliseconds)
  promise.then((value) => { clearTimeout(timer); resolve(value) }, (error) => { clearTimeout(timer); reject(error) })
})

/** Il testo di una risposta di strumento: il testo si tiene, il resto si indica (immagini, audio) o si legge se è testo incorporato. */
function resultText(result) {
  const parts = []
  for (const item of Array.isArray(result?.content) ? result.content : []) {
    if (item.type === 'text') parts.push(String(item.text ?? ''))
    else if (item.type === 'resource' && item.resource && typeof item.resource.text === 'string') parts.push(item.resource.text)
    else if (item.type === 'resource_link') parts.push(`[link: ${item.uri || item.name || ''}]`)
    else parts.push(`[${item.type || 'content'}${item.mimeType ? ` ${item.mimeType}` : ''} not shown]`)
  }
  if (!parts.length && result?.structuredContent) parts.push(JSON.stringify(result.structuredContent))
  return parts.join('\n').trim()
}

function createMcpClient({ log = () => {}, loadSdkImpl = loadSdk } = {}) {
  // key → { client, transport, hash, stderr }: un collegamento per server, riusato finché la configurazione non cambia.
  const connections = new Map()
  const pending = new Map()

  async function closeConnection(key) {
    const connection = connections.get(key)
    connections.delete(key)
    if (!connection) return
    try { await connection.client.close() } catch { /* già chiuso */ }
  }

  async function open(entry) {
    const { Client, stdio, http } = loadSdkImpl()
    const { server } = entry
    const stderr = { text: '' }
    let transport
    if (server.type === 'stdio') {
      transport = new stdio.StdioClientTransport({
        command: server.command,
        args: server.args,
        env: { ...stdio.getDefaultEnvironment(), ...entry.env },
        stderr: 'pipe',
      })
      // Gli ultimi messaggi del server aiutano a capire perché non parte; non si scrivono nei log (possono contenere dati).
      transport.stderr?.on('data', (chunk) => { stderr.text = `${stderr.text}${chunk}`.slice(-2000) })
    } else {
      const options = { requestInit: { headers: { ...entry.headers } } }
      // Con OAuth il token cambia (scade e si rinnova): lo si legge a ogni richiesta.
      if (entry.getHeaders) {
        options.fetch = async (url, init) => {
          const headers = new Headers(init?.headers)
          for (const [name, value] of Object.entries(await entry.getHeaders())) headers.set(name, value)
          return fetch(url, { ...init, headers })
        }
      }
      transport = new http(new URL(server.url), options)
    }
    const client = new Client({ name: 'openwriter', version: '1.0.0' }, { capabilities: {} })
    const connection = { client, transport, hash: entry.hash, stderr }
    client.onclose = () => { if (connections.get(entry.key) === connection) connections.delete(entry.key) }
    try {
      await withTimeout(client.connect(transport), CONNECT_TIMEOUT_MS, 'The server did not answer in time')
    } catch (error) {
      try { await client.close() } catch { /* nulla da chiudere */ }
      const detail = stderr.text.trim()
      throw new Error(`${error.message}${detail ? ` — ${detail.split('\n').slice(-3).join(' ')}` : ''}`)
    }
    connections.set(entry.key, connection)
    log(`mcp: connesso ${entry.key}`)
    return connection
  }

  /**
   * Il collegamento al server (lo avvia se serve). Due richieste con la stessa configurazione, insieme, aspettano lo stesso avvio.
   * Un avvio in corso con una configurazione vecchia non si presta a chi ne ha una nuova: lo si lascia finire, lo si chiude e se ne apre un altro.
   */
  async function connect(entry) {
    for (;;) {
      const existing = connections.get(entry.key)
      if (existing && existing.hash === entry.hash) return existing
      const inFlight = pending.get(entry.key)
      if (inFlight) {
        if (inFlight.hash === entry.hash) return inFlight.promise
        await inFlight.promise.catch(() => {})
        continue
      }
      if (existing) { await closeConnection(entry.key); continue }
      const promise = open(entry).finally(() => { if (pending.get(entry.key)?.promise === promise) pending.delete(entry.key) })
      pending.set(entry.key, { hash: entry.hash, promise })
      return promise
    }
  }

  return {
    /** Gli strumenti del server: { name, description, inputSchema, readOnly }. */
    async listTools(entry) {
      const { client } = await connect(entry)
      const tools = []
      let cursor
      for (let page = 0; page < MAX_TOOL_PAGES; page += 1) {
        const answer = await withTimeout(client.listTools(cursor ? { cursor } : undefined), CONNECT_TIMEOUT_MS, 'The server did not list its tools in time')
        for (const tool of answer.tools || []) {
          tools.push({ name: String(tool.name), description: String(tool.description || tool.title || ''), inputSchema: tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : { type: 'object' }, readOnly: tool.annotations?.readOnlyHint === true })
        }
        cursor = answer.nextCursor
        if (!cursor) break
      }
      return tools
    },

    /** Chiama uno strumento: { text, isError }. Un server che si blocca dà un errore, non blocca la conversazione. */
    async callTool(entry, name, args = {}, { timeoutMs = CALL_TIMEOUT_MS, signal } = {}) {
      const { client } = await connect(entry)
      try {
        const result = await client.callTool({ name, arguments: args && typeof args === 'object' ? args : {} }, undefined, { timeout: timeoutMs, ...(signal ? { signal } : {}) })
        return { text: resultText(result), isError: result?.isError === true }
      } catch (error) {
        // Un collegamento che ha dato errore di trasporto si riapre alla prossima chiamata.
        if (!/MCP error|timed out/i.test(error.message)) await closeConnection(entry.key)
        throw error
      }
    },

    close: closeConnection,
    async closeAll() { await Promise.all([...connections.keys()].map(closeConnection)) },
    openConnections: () => connections.size,
  }
}

module.exports = { createMcpClient, resultText }
