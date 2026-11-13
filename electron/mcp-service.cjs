/**
 * Il client MCP visto dall'assistente: unisce archivio dei server (mcp-servers-store.cjs) e client (mcp-client.cjs).
 * Decide quali strumenti il modello vede (server in uso, fidati, con credenziali, e solo quelli accesi dall'utente), come si chiamano,
 * quando serve chiedere conferma prima di una chiamata e quanto può essere lungo un risultato.
 */
const MAX_TOOLS_PER_SERVER = 30
const MAX_RESULT_CHARS = 20000
const MAX_DESCRIPTION_CHARS = 1000
const MAX_SCHEMA_CHARS = 6000
const MAX_NAME_CHARS = 64

const slugOf = (name) => String(name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'server'
const safePart = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '_')

/** Il nome con cui il modello vede lo strumento di un server: `servizio__strumento`, al più 64 caratteri. */
function toolName(slug, tool) {
  return `${slug}__${safePart(tool)}`.slice(0, MAX_NAME_CHARS)
}

/**
 * Chiede conferma prima di una chiamata quando lo strumento non si dichiara di sola lettura (`readOnlyHint`),
 * e sempre quando il server è impostato su «chiedi ogni volta». L'indicazione la dà il server stesso: non è una garanzia.
 */
const needsConfirmation = (server, tool) => server.alwaysAsk === true || tool.readOnly !== true

function createMcpService({ store, client, confirm, oauth = null, openExternal = async () => {}, log = () => {} }) {
  // Rinnovi del token in corso, per server: due richieste insieme ne aspettano uno solo.
  const refreshing = new Map()

  // Un server con OAuth riceve il token a ogni richiesta (rinnovato se sta per scadere). Se il rinnovo è rifiutato l'accesso è scaduto o revocato.
  async function accessToken(entry) {
    const { server } = entry
    const saved = store.getOauth(server.id)
    if (saved.accessToken && Number(saved.expiresAt) > Date.now() + 60000) return saved.accessToken
    if (!saved.refreshToken) throw new Error('Sign in to this service again')
    if (!refreshing.has(server.id)) {
      refreshing.set(server.id, oauth.refresh({ serverUrl: server.url, clientId: server.clientId, clientSecret: saved.clientSecret, refreshToken: saved.refreshToken })
        .then((tokens) => { store.setOauth(server.id, tokens); return tokens.accessToken })
        .catch((error) => {
          if (error.code === 'invalid_grant') { store.setOauth(server.id, null); throw new Error('The sign-in of this service expired or was revoked: sign in again') }
          throw error
        })
        .finally(() => refreshing.delete(server.id)))
    }
    return refreshing.get(server.id)
  }
  const prepare = (entry) => (entry.server.auth === 'oauth' && oauth ? { ...entry, getHeaders: async () => ({ Authorization: `Bearer ${await accessToken(entry)}` }) } : entry)

  // Tabella degli strumenti offerti l'ultima volta, per progetto: nome visto dal modello → { entry, tool }.
  const tables = new Map()
  // Strumenti elencati per collegamento (si rileggono se il server cambia configurazione).
  const listed = new Map()

  async function toolsOf(entry) {
    const cached = listed.get(entry.key)
    if (cached && cached.hash === entry.hash && Date.now() - cached.at < 5 * 60 * 1000) return cached.tools
    const tools = await client.listTools(entry)
    listed.set(entry.key, { hash: entry.hash, at: Date.now(), tools })
    return tools
  }

  return {
    needsConfirmation,

    /**
     * Gli strumenti da offrire al modello per il progetto: { tools: [{ name, description, inputSchema, server, readOnly }], problems: [{ server, state | error }] }.
     * Un server che non parte non blocca gli altri: finisce tra i problemi.
     */
    async tools(project) {
      const table = new Map()
      const tools = []
      const problems = []
      const slugs = new Set()
      for (const entry of store.active(project).map(prepare)) {
        const { server } = entry
        if (!server.enabledTools.length) continue
        if (entry.state !== 'ready') { problems.push({ server: server.name, state: entry.state }); continue }
        let available
        try { available = await toolsOf(entry) } catch (error) { problems.push({ server: server.name, error: error.message }); continue }
        let slug = slugOf(server.name)
        for (let n = 2; slugs.has(slug); n += 1) slug = `${slugOf(server.name).slice(0, 17)}_${n}`
        slugs.add(slug)
        for (const tool of available.filter((item) => server.enabledTools.includes(item.name)).slice(0, MAX_TOOLS_PER_SERVER)) {
          let name = toolName(slug, tool.name)
          for (let n = 2; table.has(name); n += 1) name = `${toolName(slug, tool.name).slice(0, MAX_NAME_CHARS - 3)}_${n}`
          const oversized = JSON.stringify(tool.inputSchema).length > MAX_SCHEMA_CHARS
          table.set(name, { entry, tool })
          tools.push({
            name,
            server: server.name,
            readOnly: tool.readOnly,
            description: `[${server.name}] ${tool.description}`.slice(0, MAX_DESCRIPTION_CHARS),
            inputSchema: oversized ? { type: 'object', additionalProperties: true } : tool.inputSchema,
          })
        }
      }
      tables.set(project, table)
      return { tools, problems }
    },

    /** Chiama uno strumento offerto: chiede conferma quando serve; un rifiuto è un errore leggibile dal modello. */
    async call(project, name, args) {
      let found = tables.get(project)?.get(name)
      if (!found) { await this.tools(project); found = tables.get(project)?.get(name) }
      if (!found) throw new Error(`Tool not available: ${name}`)
      const { entry, tool } = found
      if (!entry.server.enabledTools.includes(tool.name)) throw new Error(`Tool not available: ${name}`)
      if (needsConfirmation(entry.server, tool)) {
        const allowed = await confirm({ server: entry.server.name, tool: tool.name, args, readOnly: tool.readOnly, alwaysAsk: entry.server.alwaysAsk })
        if (!allowed) throw new Error('The user did not allow this call. Do not retry it; ask the user how to proceed if the task needs it.')
      }
      const { text, isError } = await client.callTool(entry, tool.name, args)
      const clipped = text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)}\n[…result cut at ${MAX_RESULT_CHARS} characters]` : text
      if (isError) throw new Error(clipped || 'The tool reported an error')
      return clipped || '(no output)'
    },

    /** Prova un server e ne elenca gli strumenti, per le impostazioni. Un server di progetto non confermato non si avvia. */
    async test(project, id) {
      const entry = store.resolve(project, id) && prepare(store.resolve(project, id))
      if (!entry) throw new Error('Server not found')
      if (entry.state === 'untrusted') throw new Error('This server comes from the project and has not been confirmed yet')
      if (entry.state === 'missing-credentials') throw new Error(entry.server.auth === 'oauth' ? 'Sign in to this service first' : 'The credentials of this server are missing on this computer')
      listed.delete(entry.key)
      const tools = await toolsOf(entry)
      log(`mcp: provato ${entry.key}, ${tools.length} strumenti`)
      return tools.map((tool) => ({ name: tool.name, description: tool.description.slice(0, 300), readOnly: tool.readOnly }))
    },

    /** Accesso OAuth: apre il browser e salva i token (cifrati) a consenso dato. */
    async signIn(project, id) {
      const entry = store.resolve(project, id)
      if (!entry || entry.server.auth !== 'oauth') throw new Error('This service does not use OAuth')
      if (entry.state === 'untrusted') throw new Error('This server comes from the project and has not been confirmed yet')
      const { server } = entry
      const saved = store.getOauth(server.id)
      const tokens = await oauth.authorize({ serverUrl: server.url, clientId: server.clientId, clientSecret: saved.clientSecret, scopes: server.scopes, openExternal })
      store.setOauth(server.id, tokens)
      listed.delete(entry.key)
      await client.close(entry.key)
      log(`mcp: accesso eseguito ${entry.key}`)
      return true
    },

    async signOut(project, id) {
      const entry = store.resolve(project, id)
      if (!entry) throw new Error('Server not found')
      store.setOauth(id, null)
      listed.delete(entry.key)
      await client.close(entry.key)
      return true
    },

    forget(key) { listed.delete(key); return client.close(key) },
    closeAll: () => client.closeAll(),
  }
}

module.exports = { createMcpService, toolName, needsConfirmation, slugOf, MAX_TOOLS_PER_SERVER, MAX_RESULT_CHARS }
