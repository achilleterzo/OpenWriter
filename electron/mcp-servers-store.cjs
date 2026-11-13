/**
 * Server MCP a cui l'assistente può collegarsi (il lato *client*; il server di OpenWriter è mcp-server.cjs).
 *
 * Dove sta cosa:
 *  - server globali: `mcp-servers.json` nei dati dell'app, sul computer;
 *  - server di un progetto: `<progetto>/.ow/mcp.json` ({ servers, use }): solo configurazione, mai credenziali;
 *  - credenziali (variabili d'ambiente e intestazioni): cifrate con safeStorage in `mcp-secrets.json`, legate all'id del server, sul computer;
 *  - fiducia: `mcp-trust.json`, fuori dal progetto: per ogni server di un progetto l'impronta di ciò che l'utente ha confermato.
 *
 * Un server definito da un progetto è codice (un comando che gira con i permessi dell'utente) e può arrivare con un progetto copiato o clonato:
 * non parte finché l'utente non lo conferma, e se comando, argomenti, indirizzo o nomi delle credenziali cambiano si chiede di nuovo.
 */
const fs = require('node:fs')
const path = require('node:path')
const nodeCrypto = require('node:crypto')
const { writeFileAtomic } = require('./atomic-write.cjs')

const TYPES = ['stdio', 'http']
const MAX_SERVERS = 50
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const HEADER_NAME = /^[A-Za-z0-9-]+$/

const plain = (value, limit) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit)
const names = (value, pattern) => [...new Set((Array.isArray(value) ? value : []).map((item) => plain(item, 100)).filter((item) => pattern.test(item)))].slice(0, 30)

/** Indirizzo http(s) valido, oppure ''. */
function cleanUrl(value) {
  try {
    const url = new URL(String(value ?? '').trim())
    return /^https?:$/.test(url.protocol) ? url.toString() : ''
  } catch { return '' }
}

/** Una configurazione pulita (senza credenziali), oppure null se non è un server utilizzabile. */
function cleanServer(input) {
  if (!input || typeof input !== 'object') return null
  const type = TYPES.includes(input.type) ? input.type : null
  const name = plain(input.name, 60)
  if (!type || !name) return null
  const server = {
    id: /^[a-z0-9-]{6,40}$/.test(String(input.id || '')) ? String(input.id) : nodeCrypto.randomUUID(),
    name,
    type,
    command: type === 'stdio' ? plain(input.command, 500) : '',
    args: type === 'stdio' ? (Array.isArray(input.args) ? input.args : []).map((item) => String(item ?? '').replace(/\u0000/g, '').slice(0, 1000)).slice(0, 50) : [],
    url: type === 'http' ? cleanUrl(input.url) : '',
    envNames: type === 'stdio' ? names(input.envNames, ENV_NAME) : [],
    headerNames: type === 'http' ? names(input.headerNames, HEADER_NAME) : [],
    // Accesso con OAuth (solo HTTP): l'ID del client e gli ambiti stanno nella configurazione; segreto e token, cifrati, sul computer.
    auth: type === 'http' && input.auth === 'oauth' ? 'oauth' : 'none',
    clientId: type === 'http' && input.auth === 'oauth' ? plain(input.clientId, 300) : '',
    scopes: type === 'http' && input.auth === 'oauth' ? [...new Set((Array.isArray(input.scopes) ? input.scopes : []).map((item) => plain(item, 300)).filter(Boolean))].slice(0, 20) : [],
    // "Chiedi ogni volta": con il server impostato così anche gli strumenti che si dichiarano di sola lettura chiedono conferma.
    alwaysAsk: input.alwaysAsk === true,
    // Gli strumenti che l'utente ha acceso: all'inizio nessuno.
    enabledTools: [...new Set((Array.isArray(input.enabledTools) ? input.enabledTools : []).map((item) => plain(item, 128)).filter(Boolean))].slice(0, 200),
  }
  if (type === 'stdio' && !server.command) return null
  if (type === 'http' && !server.url) return null
  return server
}

/** Impronta di ciò che fa partire il server: se cambia, la conferma data non vale più. */
function launchHash(server) {
  return nodeCrypto.createHash('sha256').update(JSON.stringify([server.type, server.command, server.args, server.url, server.envNames, server.headerNames, server.auth, server.clientId, server.scopes])).digest('hex')
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

/**
 * `directory`: dove stanno i file sul computer (i dati dell'app). `secrets`: { available(), encrypt(text) → base64, decrypt(base64) → text }.
 * `getChain(project)`: le cartelle dei progetti che valgono per `project`, dalla più esterna alla più vicina (il progetto stesso per ultimo).
 */
function createMcpServersStore({ directory, secrets, getChain = (project) => [project] }) {
  const globalFile = path.join(directory, 'mcp-servers.json')
  const secretsFile = path.join(directory, 'mcp-secrets.json')
  const trustFile = path.join(directory, 'mcp-trust.json')
  const projectFile = (project) => path.join(project, '.ow', 'mcp.json')

  const readServers = (file) => {
    const data = readJson(file, {})
    return (Array.isArray(data.servers) ? data.servers : []).map(cleanServer).filter(Boolean).slice(0, MAX_SERVERS)
  }
  const readUse = (project) => {
    const data = readJson(projectFile(project), {})
    return [...new Set((Array.isArray(data.use) ? data.use : []).map((item) => String(item)))].slice(0, MAX_SERVERS)
  }
  const writeProject = (project, patch) => {
    const next = { servers: readServers(projectFile(project)), use: readUse(project), ...patch }
    fs.mkdirSync(path.dirname(projectFile(project)), { recursive: true })
    writeFileAtomic(projectFile(project), `${JSON.stringify(next, null, 2)}\n`)
  }

  // Credenziali: un blob cifrato per server ({ env: {NOME: valore}, headers: {...} }).
  const readSecrets = (id) => {
    const all = readJson(secretsFile, {})
    if (!all[id] || !secrets.available()) return { env: {}, headers: {}, oauth: {} }
    try {
      const value = JSON.parse(secrets.decrypt(all[id]))
      const object = (item) => (item && typeof item === 'object' ? item : {})
      return { env: object(value.env), headers: object(value.headers), oauth: object(value.oauth) }
    } catch { return { env: {}, headers: {}, oauth: {} } }
  }
  function writeSecrets(id, value) {
    if (!secrets.available()) throw new Error('Secure credential storage is not available on this system')
    fs.mkdirSync(directory, { recursive: true })
    const all = readJson(secretsFile, {})
    all[id] = secrets.encrypt(JSON.stringify(value))
    writeFileAtomic(secretsFile, JSON.stringify(all), { mode: 0o600 })
  }
  function dropSecrets(id) {
    const all = readJson(secretsFile, {})
    if (!(id in all)) return
    delete all[id]
    writeFileAtomic(secretsFile, JSON.stringify(all), { mode: 0o600 })
  }
  const missingCredentials = (server) => {
    const saved = readSecrets(server.id)
    return server.envNames.some((name) => !(name in saved.env)) || server.headerNames.some((name) => !(name in saved.headers)) || (server.auth === 'oauth' && !saved.oauth.refreshToken && !saved.oauth.accessToken)
  }

  const trustKey = (origin, id) => `${path.resolve(origin)}|${id}`
  const isTrusted = (origin, server) => readJson(trustFile, {})[trustKey(origin, server.id)] === launchHash(server)

  /** I server di un progetto (e dei progetti che lo contengono): sul nome uguale vince il più vicino. */
  function projectServers(project) {
    const found = new Map()
    for (const origin of getChain(project)) {
      for (const server of readServers(projectFile(origin))) found.set(server.name.toLowerCase(), { ...server, origin, inherited: path.resolve(origin) !== path.resolve(project) })
    }
    return [...found.values()]
  }
  const usedGlobalIds = (project) => [...new Set(getChain(project).flatMap(readUse))]

  const withState = (server, origin) => ({
    ...server,
    scope: origin ? 'project' : 'global',
    ...(origin ? { origin, trusted: isTrusted(origin, server) } : { trusted: true }),
    missingCredentials: missingCredentials(server),
    ...(server.auth === 'oauth' ? { signedIn: Boolean(readSecrets(server.id).oauth.refreshToken || readSecrets(server.id).oauth.accessToken), hasClientSecret: Boolean(readSecrets(server.id).oauth.clientSecret) } : {}),
  })

  const toEntry = (server, origin) => {
    const state = origin && !isTrusted(origin, server) ? 'untrusted' : missingCredentials(server) ? 'missing-credentials' : 'ready'
    const saved = state === 'ready' ? readSecrets(server.id) : { env: {}, headers: {}, oauth: {} }
    return { server, origin, state, key: `${origin ? 'p' : 'g'}:${server.id}`, hash: launchHash(server), env: saved.env, headers: saved.headers }
  }

  return {
    cleanServer,
    launchHash,

    /** Per le impostazioni: i server globali, quelli del progetto (anche ereditati) e quali globali il progetto usa. */
    list(project = null) {
      return {
        global: readServers(globalFile).map((server) => withState(server, null)),
        project: project ? projectServers(project).map((server) => ({ ...withState(server, server.origin), inherited: server.inherited })) : [],
        use: project ? usedGlobalIds(project) : [],
        secureStorage: secrets.available(),
      }
    },

    /**
     * Salva un server. `credentials`: { env: {NOME: valore | null}, headers: {...} }: un valore lo imposta, null lo toglie, ciò che manca resta com'è.
     * I nomi delle credenziali del server sono quelli presenti dopo l'aggiornamento. Un server di progetto modificato perde la fiducia (l'impronta cambia).
     */
    save({ project = null, server: input, credentials = {} }) {
      const file = project ? projectFile(project) : globalFile
      const servers = readServers(file)
      const existing = servers.find((item) => item.id === input?.id)
      const merged = { ...(existing || {}), ...(input || {}) }
      const saved = cleanServer({ ...merged, id: existing?.id || input?.id })
      if (!saved) throw new Error('Invalid server: give a name and a command or an address')
      if (!existing && servers.length >= MAX_SERVERS) throw new Error('Too many servers')
      if (servers.some((item) => item.id !== saved.id && item.name.toLowerCase() === saved.name.toLowerCase())) throw new Error('A server with this name already exists')

      const current = readSecrets(saved.id)
      const patch = (target, changes, allowed) => {
        for (const [name, value] of Object.entries(changes && typeof changes === 'object' ? changes : {})) {
          if (!allowed.includes(name)) continue
          if (value === null) delete target[name]
          else if (typeof value === 'string' && value !== '') target[name] = value.slice(0, 8000)
        }
        for (const name of Object.keys(target)) if (!allowed.includes(name)) delete target[name]
      }
      // Anche con la lista dei nomi data dal chiamante, valgono i nomi delle credenziali impostate o già presenti.
      const envNames = [...new Set([...saved.envNames, ...Object.entries(credentials.env || {}).filter(([, value]) => typeof value === 'string' && value !== '').map(([name]) => name)])].filter((name) => ENV_NAME.test(name))
      const headerNames = [...new Set([...saved.headerNames, ...Object.entries(credentials.headers || {}).filter(([, value]) => typeof value === 'string' && value !== '').map(([name]) => name)])].filter((name) => HEADER_NAME.test(name))
      const final = { ...saved, envNames: saved.type === 'stdio' ? envNames : [], headerNames: saved.type === 'http' ? headerNames : [] }
      const next = { env: { ...current.env }, headers: { ...current.headers }, oauth: { ...current.oauth } }
      // Con un altro client OAuth, o senza OAuth, i token di prima non valgono più.
      if (final.auth !== 'oauth') next.oauth = {}
      else if (existing && existing.clientId !== final.clientId) next.oauth = { clientSecret: next.oauth.clientSecret }
      if (final.auth === 'oauth' && typeof credentials.oauth?.clientSecret === 'string' && credentials.oauth.clientSecret !== '') next.oauth.clientSecret = credentials.oauth.clientSecret.slice(0, 500)
      patch(next.env, credentials.env, final.envNames)
      patch(next.headers, credentials.headers, final.headerNames)
      if (Object.keys(next.env).length || Object.keys(next.headers).length || Object.keys(next.oauth).length || existing) writeSecrets(final.id, next)

      const list = existing ? servers.map((item) => (item.id === final.id ? final : item)) : [...servers, final]
      if (project) writeProject(project, { servers: list })
      else {
        fs.mkdirSync(directory, { recursive: true })
        writeFileAtomic(globalFile, `${JSON.stringify({ servers: list }, null, 2)}\n`)
      }
      return withState(final, project)
    },

    remove({ project = null, id }) {
      const file = project ? projectFile(project) : globalFile
      const servers = readServers(file)
      if (!servers.some((item) => item.id === id)) return false
      const list = servers.filter((item) => item.id !== id)
      if (project) writeProject(project, { servers: list })
      else writeFileAtomic(globalFile, `${JSON.stringify({ servers: list }, null, 2)}\n`)
      dropSecrets(id)
      return true
    },

    /** Segreto del client e token OAuth di un server (solo per il processo principale). */
    getOauth(id) { return readSecrets(id).oauth },

    /** Aggiorna i token OAuth di un server (`null` toglie l'accesso, ma tiene il segreto del client). */
    setOauth(id, patch) {
      const current = readSecrets(id)
      const oauth = patch === null ? { clientSecret: current.oauth.clientSecret } : { ...current.oauth, ...patch }
      writeSecrets(id, { ...current, oauth })
    },

    /** Quali server globali usa il progetto. */
    setUse(project, ids) {
      const known = new Set(readServers(globalFile).map((server) => server.id))
      writeProject(project, { use: [...new Set((Array.isArray(ids) ? ids : []).map(String).filter((id) => known.has(id)))] })
    },

    /** L'utente ha visto comando o indirizzo per intero e conferma: vale finché l'impronta non cambia. */
    trust(project, id) {
      const server = projectServers(project).find((item) => item.id === id)
      if (!server) throw new Error('Server not found')
      const all = readJson(trustFile, {})
      all[trustKey(server.origin, server.id)] = launchHash(server)
      fs.mkdirSync(directory, { recursive: true })
      writeFileAtomic(trustFile, JSON.stringify(all))
      return true
    },

    /**
     * I server in uso per il progetto, pronti per avviarsi (con le credenziali) o con il motivo per cui non lo sono:
     * state = 'ready' | 'untrusted' | 'missing-credentials'.
     */
    active(project) {
      const used = new Set(usedGlobalIds(project))
      return [
        ...readServers(globalFile).filter((server) => used.has(server.id)).map((server) => toEntry(server, null)),
        ...projectServers(project).map((server) => toEntry(server, server.origin)),
      ]
    },

    /** Un server per id, usato o no dal progetto (per provarlo dalle impostazioni, anche senza un progetto aperto). */
    resolve(project, id) {
      const own = project ? projectServers(project).find((server) => server.id === id) : null
      if (own) return toEntry(own, own.origin)
      const global = readServers(globalFile).find((server) => server.id === id)
      return global ? toEntry(global, null) : null
    },
  }
}

module.exports = { createMcpServersStore, cleanServer, launchHash }
