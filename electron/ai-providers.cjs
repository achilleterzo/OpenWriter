const { execFile, execFileSync, spawn } = require('node:child_process')
const http = require('node:http')
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')

const PROVIDERS = ['ollama', 'ollama-cloud', 'codex', 'claude']
const LABELS = { ollama: 'Ollama', 'ollama-cloud': 'Ollama Cloud', codex: 'Codex', claude: 'Claude' }
// Livelli di ragionamento supportati da ciascun provider; il primo è il predefinito.
const REASONING_LEVELS = {
  ollama: ['instant', 'low', 'medium', 'high'],
  'ollama-cloud': ['instant', 'low', 'medium', 'high'],
  codex: ['default', 'low', 'medium', 'high', 'xhigh'],
  claude: ['default', 'low', 'medium', 'high', 'xhigh', 'max'],
}
const OLLAMA_CLOUD_URL = 'https://ollama.com'
const CLAUDE_MODEL_ALIASES = ['default', 'best', 'sonnet', 'opus', 'haiku', 'sonnet[1m]', 'opus[1m]', 'opusplan']
const CLI_TIMEOUT_MS = 180000
const HTTP_TIMEOUT_MS = 120000

function quotePowerShellArg(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function knownWindowsCliCommand(name) {
  if (process.platform !== 'win32') return null
  const roots = []
  if (name === 'codex') {
    const localRoots = [process.env.LOCALAPPDATA, process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Local')].filter(Boolean)
    for (const root of localRoots) {
      const installRoot = path.join(root, 'OpenAI', 'Codex', 'bin')
      try {
        for (const entry of fs.readdirSync(installRoot, { withFileTypes: true })) {
          if (entry.isDirectory()) roots.push(path.join(installRoot, entry.name))
        }
      } catch {}
    }
  }
  const npmRoots = [process.env.APPDATA, process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Roaming'), process.env.npm_config_prefix, process.env.NPM_CONFIG_PREFIX]
    .filter(Boolean)
    .map((root) => (path.basename(root).toLowerCase() === 'npm' ? root : path.join(root, 'npm')))
  roots.push(...npmRoots)
  const names = name === 'codex' ? ['codex.exe', 'codex.cmd', 'codex.bat'] : ['claude.cmd', 'claude.exe', 'claude.bat']
  const mtime = (file) => { try { return fs.statSync(file).mtimeMs } catch { return 0 } }
  return roots
    .flatMap((root) => names.map((candidate) => path.join(root, candidate)))
    .filter((candidate) => fs.existsSync(candidate))
    .sort((left, right) => mtime(right) - mtime(left))[0] || null
}

function resolveCliCommand(name) {
  if (process.platform !== 'win32') return name
  try {
    const outputs = execFileSync('where.exe', [name], { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 })
      .toString().split(/\r?\n/).map((value) => value.trim()).filter(Boolean)
    const native = outputs.find((value) => ['.exe', '.cmd', '.bat'].includes(path.extname(value).toLowerCase()))
    if (native || outputs[0]) return native || outputs[0]
  } catch {}
  return knownWindowsCliCommand(name) || name
}

function cliCommand(provider) {
  return resolveCliCommand(provider === 'codex' ? 'codex' : 'claude')
}

function cliInvocation(provider, args) {
  const command = cliCommand(provider)
  if (process.platform === 'win32') {
    return { command: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', [`& ${quotePowerShellArg(command)}`, ...args.map(quotePowerShellArg)].join(' ')] }
  }
  return { command, args, shell: true }
}

// Solo OAuth: una API key nell'ambiente del processo non deve cambiare silenziosamente la modalità di autenticazione.
function cliEnvironment(provider) {
  const environment = { ...process.env }
  if (provider === 'codex') delete environment.OPENAI_API_KEY
  if (provider === 'claude') {
    delete environment.ANTHROPIC_API_KEY
    delete environment.ANTHROPIC_AUTH_TOKEN
  }
  return environment
}

function runCli(provider, args, { cwd, input = '', timeout = CLI_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    const invocation = cliInvocation(provider, args)
    const child = spawn(invocation.command, invocation.args, { cwd: cwd || undefined, env: cliEnvironment(provider), windowsHide: true, shell: invocation.shell, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      try { child.kill() } catch {}
      reject(new Error(`${LABELS[provider]} non ha risposto entro ${Math.round(timeout / 1000)} secondi`))
    }, timeout)
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error.code === 'ENOENT' ? new Error(`Client ${LABELS[provider]} non trovato. Installalo e riprova.`) : error)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(stderr.trim() || `${LABELS[provider]} terminato con codice ${code}`))
      resolve(stdout)
    })
    child.stdin.end(input)
  })
}

function runCliStatus(provider, args) {
  return new Promise((resolve) => {
    const invocation = cliInvocation(provider, args)
    execFile(invocation.command, invocation.args, { env: cliEnvironment(provider), windowsHide: true, shell: invocation.shell, timeout: 30000, maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      const output = String(stdout || stderr || error?.message || '').trim()
      resolve({ ok: !error, missing: error?.code === 'ENOENT' || error?.code === 9009 || /not recognized|not found/i.test(output), output })
    })
  })
}

function extractCliText(raw) {
  const text = String(raw || '').trim()
  const candidates = []
  for (const line of text.split(/\r?\n/).map((value) => value.trim()).filter(Boolean)) {
    try {
      const value = JSON.parse(line)
      for (const candidate of [value.result, value.output, value.item?.text, value.item?.content, value.message?.content, value.content]) {
        if (typeof candidate === 'string') candidates.push(candidate)
      }
    } catch {}
  }
  return String(candidates.at(-1) || text).trim()
}

function requestJson(urlString, { method = 'GET', headers = {} } = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString)
    const client = url.protocol === 'https:' ? https : http
    const request = client.request(url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, timeout: HTTP_TIMEOUT_MS }, (response) => {
      let data = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => { data += chunk })
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          let detail = data
          try { detail = JSON.parse(data)?.error || detail } catch {}
          return reject(new Error(`HTTP ${response.statusCode}${detail ? `: ${String(detail).slice(0, 200)}` : ''}`))
        }
        try { resolve(JSON.parse(data)) } catch { reject(new Error('Risposta JSON non valida')) }
      })
    })
    request.on('error', reject)
    request.on('timeout', () => request.destroy(new Error(`Richiesta Ollama scaduta dopo ${HTTP_TIMEOUT_MS / 1000} secondi`)))
    if (body) request.write(JSON.stringify(body))
    request.end()
  })
}

function normalizeProviderConfig(provider, value = {}) {
  const config = value && typeof value === 'object' ? value : {}
  const normalized = { model: String(config.model || ''), reasoning: REASONING_LEVELS[provider].includes(config.reasoning) ? config.reasoning : REASONING_LEVELS[provider][0] }
  if (provider === 'ollama') normalized.endpoint = String(config.endpoint || 'http://localhost:11434').replace(/\/$/, '')
  return normalized
}

function normalizeSettings(settings = {}) {
  const saved = settings.providers && typeof settings.providers === 'object' ? settings.providers : {}
  return {
    aiEnabled: settings.aiEnabled === true,
    provider: PROVIDERS.includes(settings.provider) ? settings.provider : 'ollama',
    providers: Object.fromEntries(PROVIDERS.map((provider) => [provider, normalizeProviderConfig(provider, saved[provider])])),
    language: String(settings.language || 'Italiano'),
  }
}

/**
 * Livello di connessione ai provider AI (Ollama, Ollama Cloud, Codex CLI, Claude CLI).
 * `app` e `safeStorage` arrivano da electron; `getWorkingDirectory` è opzionale.
 */
function createAiProviders({ app, safeStorage, getWorkingDirectory = () => undefined, log = () => {} }) {
  let settings
  let sessionApiKey = ''

  const settingsPath = () => path.join(app.getPath('userData'), 'ai-settings.json')
  const credentialPath = () => path.join(app.getPath('userData'), 'ollama-cloud-key.bin')

  function getSettings() {
    if (settings) return settings
    try { settings = normalizeSettings(JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))) } catch { settings = normalizeSettings() }
    return settings
  }

  function saveSettings(value) {
    settings = normalizeSettings(value)
    fs.mkdirSync(app.getPath('userData'), { recursive: true })
    fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2))
    return settings
  }

  const activeProvider = () => getSettings().provider
  const providerConfig = (provider = activeProvider()) => getSettings().providers[provider] || normalizeProviderConfig(provider)

  function loadApiKey() {
    try {
      if (!safeStorage.isEncryptionAvailable()) return ''
      return safeStorage.decryptString(Buffer.from(fs.readFileSync(credentialPath(), 'utf8'), 'base64'))
    } catch { return '' }
  }

  function saveApiKey(value) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Archiviazione sicura delle credenziali non disponibile su questo sistema')
    const apiKey = String(value || '').trim()
    sessionApiKey = apiKey
    if (!apiKey) {
      try { fs.unlinkSync(credentialPath()) } catch {}
      return true
    }
    fs.mkdirSync(path.dirname(credentialPath()), { recursive: true })
    fs.writeFileSync(credentialPath(), safeStorage.encryptString(apiKey).toString('base64'), { encoding: 'utf8', mode: 0o600 })
    return true
  }

  const apiKey = (supplied = '') => String(supplied || sessionApiKey || loadApiKey()).trim()

  function cloudOptions(supplied = '') {
    const key = apiKey(supplied)
    if (!key) throw new Error('API key Ollama Cloud richiesta')
    return { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } }
  }

  function thinkingPayload(provider) {
    const reasoning = providerConfig(provider).reasoning
    return { think: reasoning === 'instant' ? false : reasoning }
  }

  async function ollamaChat(endpoint, body, provider, options = {}) {
    const send = (extra) => requestJson(`${endpoint}/api/chat`, { ...options, method: 'POST' }, { ...body, ...extra })
    try { return await send(thinkingPayload(provider)) } catch (error) {
      if (providerConfig(provider).reasoning === 'instant') throw error
      return send({ think: true })
    }
  }

  function assertConfigured() {
    const config = providerConfig()
    if (!getSettings().aiEnabled) throw new Error('La generazione AI è disattivata nelle impostazioni')
    if (activeProvider() === 'ollama' && !(config.endpoint && config.model)) throw new Error('Configura endpoint e modello Ollama nelle impostazioni')
    if (activeProvider() === 'ollama-cloud' && !(apiKey() && config.model)) throw new Error('Configura API key e modello Ollama Cloud nelle impostazioni')
  }

  async function requestCliPrompt(provider, prompt) {
    const rawModel = String(providerConfig(provider).model || '').trim()
    const model = /^[A-Za-z0-9._:/-]+$/.test(rawModel) ? rawModel : ''
    const reasoning = providerConfig(provider).reasoning
    const effort = reasoning === 'default' ? '' : reasoning
    const suffix = 'Return only the final answer. Do not modify files or alter the filesystem.'
    const cwd = getWorkingDirectory()
    if (provider === 'codex') {
      const args = ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check', ...(model ? ['--model', model] : []), ...(effort ? ['-c', `model_reasoning_effort="${effort}"`] : []), '-']
      return extractCliText(await runCli(provider, args, { cwd, input: `${prompt}\n\n${suffix}` }))
    }
    const args = ['-p', '--output-format', 'json', '--permission-mode', 'plan', '--tools', 'Read', ...(model ? ['--model', model] : []), ...(effort ? ['--effort', effort] : [])]
    return extractCliText(await runCli(provider, args, { cwd, input: `${prompt}\n\n${suffix}` }))
  }

  /** Invia una conversazione `[{ role, content }]` al provider attivo e restituisce il testo della risposta. */
  async function chat(messages) {
    assertConfigured()
    const provider = activeProvider()
    const config = providerConfig(provider)
    const list = (Array.isArray(messages) ? messages : []).map((message) => ({ role: message?.role || 'user', content: String(message?.content ?? '') }))
    log(`[AI] ${LABELS[provider]} richiesta (${list.length} messaggi)`)
    if (provider === 'ollama') {
      const result = await ollamaChat(config.endpoint, { model: config.model, messages: list, stream: false }, provider)
      return String(result?.message?.content || '').trim()
    }
    if (provider === 'ollama-cloud') {
      const result = await ollamaChat(OLLAMA_CLOUD_URL, { model: config.model, messages: list, stream: false }, provider, cloudOptions())
      return String(result?.message?.content || '').trim()
    }
    const prompt = list.map((message) => `${message.role.toUpperCase()}:\n${message.content}`).join('\n\n')
    return requestCliPrompt(provider, prompt)
  }

  async function getStatus(provider = activeProvider()) {
    const selected = PROVIDERS.includes(provider) ? provider : 'ollama'
    const config = providerConfig(selected)
    const base = { provider: selected, label: LABELS[selected] }
    if (selected === 'ollama') return { ...base, installed: true, authenticated: false, configured: Boolean(config.endpoint && config.model) }
    if (selected === 'ollama-cloud') return { ...base, installed: true, authenticated: Boolean(apiKey()), configured: Boolean(apiKey() && config.model) }
    const command = cliCommand(selected)
    const status = await runCliStatus(selected, selected === 'codex' ? ['login', 'status'] : ['auth', 'status'])
    // `claude auth status` esce con 0 anche da non autenticato: va letto il campo loggedIn.
    let authenticated = status.ok
    if (selected === 'claude' && status.ok) {
      try { authenticated = JSON.parse(status.output).loggedIn === true } catch { authenticated = false }
    }
    return { ...base, command, installed: !status.missing, authenticated, configured: authenticated }
  }

  let loginChild = null

  function stopLogin() {
    if (loginChild) { try { loginChild.kill() } catch {} }
    loginChild = null
  }

  // Avvia il login OAuth della CLI, cattura l'URL stampato e lo apre nel browser predefinito.
  // Se la CLI chiede un codice ("Paste code here"), va inviato con submitLoginCode.
  async function login(provider = activeProvider(), { openExternal } = {}) {
    if (!['codex', 'claude'].includes(provider)) throw new Error('Seleziona Codex o Claude per avviare il login OAuth')
    const availability = await runCliStatus(provider, ['--version'])
    if (availability.missing) throw new Error(`Client ${LABELS[provider]} non trovato. Installalo e riprova.`)
    stopLogin()
    const invocation = cliInvocation(provider, provider === 'codex' ? ['login'] : ['auth', 'login'])
    const child = spawn(invocation.command, invocation.args, { cwd: getWorkingDirectory() || undefined, env: cliEnvironment(provider), windowsHide: true, shell: invocation.shell, stdio: ['pipe', 'pipe', 'pipe'] })
    loginChild = child
    return new Promise((resolve) => {
      let output = ''
      let opened = false
      let done = false
      const finish = (result) => { if (!done) { done = true; clearTimeout(timer); resolve(result) } }
      const timer = setTimeout(() => finish({ started: true, provider, url: null, needsCode: false }), 10000)
      const onData = (chunk) => {
        output += chunk
        log(`[AI] login ${LABELS[provider]}: ${String(chunk).trim()}`)
        const url = output.match(/https:\/\/[^\s"'<>]+/)?.[0]
        if (url && !opened) {
          opened = true
          Promise.resolve(openExternal?.(url)).catch(() => {})
          finish({ started: true, provider, url, needsCode: /paste code|enter.*code/i.test(output) || /oauth\/code\/callback/.test(url) })
        }
      }
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stdout.on('data', onData)
      child.stderr.on('data', onData)
      child.once('error', (error) => { log(`[AI] login ${LABELS[provider]} non riuscito: ${error.message}`); finish({ started: false, provider, error: error.message }) })
      child.once('close', () => { if (loginChild === child) loginChild = null; finish({ started: true, provider, url: null, needsCode: false }) })
    })
  }

  function submitLoginCode(code) {
    if (!loginChild?.stdin.writable) throw new Error('Nessun login in corso. Premi di nuovo Accedi.')
    loginChild.stdin.write(`${String(code || '').trim()}
`)
    return true
  }

  function listCodexModels() {
    return new Promise((resolve, reject) => {
      const invocation = cliInvocation('codex', ['app-server'])
      const child = spawn(invocation.command, invocation.args, { cwd: getWorkingDirectory() || undefined, env: cliEnvironment('codex'), windowsHide: true, shell: invocation.shell, stdio: ['pipe', 'pipe', 'pipe'] })
      let buffer = ''
      let stderr = ''
      let settled = false
      const finish = (error, value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try { child.kill() } catch {}
        error ? reject(error) : resolve(value)
      }
      const timer = setTimeout(() => finish(new Error('Rilevamento modelli Codex scaduto')), 30000)
      const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk) => { stderr += chunk })
      child.stdout.on('data', (chunk) => {
        buffer += chunk
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''
        for (const line of lines) {
          let message
          try { message = JSON.parse(line) } catch { continue }
          if (message.error) return finish(new Error(message.error.message || 'Errore Codex app-server'))
          if (message.id === 1) {
            send({ method: 'initialized', params: {} })
            send({ method: 'model/list', id: 2, params: { limit: 100, includeHidden: false } })
          }
          if (message.id === 2) {
            const models = Array.isArray(message.result?.data) ? message.result.data : []
            finish(null, models
              .filter((model) => typeof model?.model === 'string' && model.model)
              .sort((left, right) => Number(Boolean(right.isDefault)) - Number(Boolean(left.isDefault)))
              .map((model) => model.model))
          }
        }
      })
      child.once('error', (error) => finish(error.code === 'ENOENT' ? new Error('Client Codex non trovato. Assicurati che `codex` sia nel PATH.') : error))
      child.once('close', (code) => { if (!settled && code !== 0) finish(new Error(stderr.trim() || `Rilevamento modelli Codex fallito (codice ${code})`)) })
      send({ method: 'initialize', id: 1, params: { clientInfo: { name: 'openwriter', title: 'OpenWriter', version: app.getVersion() } } })
    })
  }

  async function listModels({ provider = activeProvider(), endpoint, apiKey: suppliedKey } = {}) {
    if (provider === 'claude') return CLAUDE_MODEL_ALIASES
    if (provider === 'codex') return listCodexModels()
    const names = (data) => (Array.isArray(data?.models) ? data.models : []).map((model) => model.name || model.model).filter(Boolean)
    if (provider === 'ollama-cloud') {
      const supplied = String(suppliedKey || '').trim()
      const data = await requestJson(`${OLLAMA_CLOUD_URL}/api/tags`, cloudOptions(supplied))
      if (supplied) sessionApiKey = supplied
      return names(data)
    }
    const target = String(endpoint || providerConfig('ollama').endpoint || '').replace(/\/$/, '')
    if (!target) throw new Error('Configura l\'endpoint Ollama nelle impostazioni')
    return names(await requestJson(`${target}/api/tags`))
  }

  return { getSettings, saveSettings, hasApiKey: () => Boolean(loadApiKey()), saveApiKey, getStatus, login, submitLoginCode, stopLogin, listModels, chat }
}

module.exports = { createAiProviders }
