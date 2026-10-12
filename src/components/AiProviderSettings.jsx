import { useCallback, useEffect, useState } from 'react'
import { Bot, CheckCircle2, RefreshCw } from 'lucide-react'
import ollamaLogo from '../assets/provider-logos/ollama.svg'
import codexLogo from '../assets/provider-logos/codex.svg'
import claudeCodeLogo from '../assets/provider-logos/claude-code.svg'

const ai = window.electronAPI?.ai

const providers = [
  { value: 'ollama', label: 'Ollama', description: 'Servizio HTTP locale' },
  { value: 'ollama-cloud', label: 'Ollama Cloud', description: 'API ospitata con API key' },
  { value: 'codex', label: 'Codex', description: 'CLI nativa con OAuth ChatGPT' },
  { value: 'claude', label: 'Claude', description: 'CLI nativa con OAuth Claude' },
]
const logos = { ollama: ollamaLogo, 'ollama-cloud': ollamaLogo, codex: codexLogo, claude: claudeCodeLogo }
const ollamaReasoning = [
  { value: 'instant', label: 'Istantaneo' },
  { value: 'low', label: 'Basso' },
  { value: 'medium', label: 'Medio' },
  { value: 'high', label: 'Alto' },
]
const defaultReasoning = { value: 'default', label: 'Predefinito del client' }
const reasoningByProvider = {
  ollama: ollamaReasoning,
  'ollama-cloud': ollamaReasoning,
  codex: [defaultReasoning, ...ollamaReasoning.slice(1), { value: 'xhigh', label: 'Molto alto' }],
  claude: [defaultReasoning, ...ollamaReasoning.slice(1), { value: 'xhigh', label: 'Molto alto' }, { value: 'max', label: 'Massimo' }],
}

const fieldClass = 'mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-violet-400 disabled:opacity-60'
const buttonClass = 'rounded-md bg-slate-700 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-600 disabled:cursor-wait disabled:opacity-60'

export default function AiProviderSettings() {
  const [settings, setSettings] = useState(null)
  const [models, setModels] = useState([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [hasSavedKey, setHasSavedKey] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ai) return
    ai.getSettings().then(setSettings)
    ai.hasApiKey().then(setHasSavedKey)
  }, [])

  const provider = settings?.provider
  const config = settings?.providers?.[provider] || {}
  const native = provider === 'codex' || provider === 'claude'
  const cloud = provider === 'ollama-cloud'

  const persist = useCallback((next) => {
    setSettings(next)
    ai.saveSettings(next).catch((reason) => setError(reason.message))
  }, [])

  const updateConfig = (changes) => persist({ ...settings, providers: { ...settings.providers, [provider]: { ...config, ...changes } } })

  const loadModels = useCallback(async (request = {}) => {
    setModelsLoading(true)
    setError('')
    try {
      setModels(await ai.listModels({ provider, endpoint: config.endpoint, ...request }))
    } catch (reason) {
      setModels([])
      setError(reason.message)
    } finally {
      setModelsLoading(false)
    }
  }, [provider, config.endpoint])

  const refreshStatus = useCallback(async () => {
    setStatus(null)
    try { setStatus(await ai.getStatus(provider)) } catch (reason) { setError(reason.message) }
  }, [provider])

  // Al cambio provider (o all'attivazione dell'AI) ricarica stato e modelli disponibili.
  useEffect(() => {
    if (!settings?.aiEnabled || !provider) return
    setModels([])
    setError('')
    if (native) refreshStatus()
    if (provider !== 'ollama-cloud' || hasSavedKey) loadModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.aiEnabled, provider, hasSavedKey])

  async function saveKey() {
    try {
      await ai.saveApiKey(apiKey)
      setHasSavedKey(Boolean(apiKey.trim()))
      if (apiKey.trim()) await loadModels({ apiKey })
      setApiKey('')
    } catch (reason) {
      setError(reason.message)
    }
  }

  const [loggingIn, setLoggingIn] = useState(false)
  const [loginInfo, setLoginInfo] = useState(null)
  const [loginCode, setLoginCode] = useState('')

  // Dopo "Accedi" il login prosegue nel browser: ricontrolla lo stato finché non risulta autenticato.
  async function login() {
    setError('')
    setLoggingIn(true)
    try {
      const result = await ai.login(provider)
      if (result.started === false) throw new Error(result.error || 'Avvio del login non riuscito')
      setLoginInfo(result)
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        const next = await ai.getStatus(provider)
        setStatus(next)
        if (next.authenticated) break
      }
    } catch (reason) {
      setError(reason.message)
    } finally {
      setLoggingIn(false)
      setLoginInfo(null)
    }
  }

  async function sendCode() {
    try {
      await ai.submitLoginCode(loginCode)
      setLoginCode('')
    } catch (reason) {
      setError(reason.message)
    }
  }

  if (!ai) {
    return <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">Il processo Electron è obsoleto: riavvia l'app (npm run dev) per caricare il nuovo preload.</p>
  }
  if (!settings) return null

  const connected = status?.provider === provider && status.authenticated
  const modelOptions = [...new Set([config.model, ...models].filter(Boolean))]

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="text-cyan-400" size={20} />
            <h2 className="text-lg font-semibold">Assistente AI</h2>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">Provider usato per la scrittura e la revisione dei testi.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.aiEnabled}
          aria-label="Abilita assistente AI"
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings.aiEnabled ? 'bg-violet-600' : 'bg-slate-700'}`}
          onClick={() => persist({ ...settings, aiEnabled: !settings.aiEnabled })}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${settings.aiEnabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {settings.aiEnabled && (
        <div className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <span className="text-sm text-slate-300">Provider</span>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Provider AI">
              {providers.map((option) => {
                const active = provider === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    className={`flex min-w-0 items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${active ? 'border-teal-700 bg-teal-950/60 text-teal-300 ring-1 ring-inset ring-teal-900' : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-500 hover:bg-slate-800 hover:text-slate-100'}`}
                    onClick={() => persist({ ...settings, provider: option.value })}
                  >
                    <img src={logos[option.value]} alt="" aria-hidden="true" className="h-7 w-7 shrink-0 rounded-md bg-stone-100 object-contain p-1" />
                    <span className="grid min-w-0 gap-0.5">
                      <strong className="truncate text-sm font-semibold">{option.label}</strong>
                      <small className={`truncate text-xs ${active ? 'text-teal-200/70' : 'text-slate-500'}`}>{option.description}</small>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {native && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className={`flex items-center gap-2 ${connected ? 'text-emerald-400' : 'text-slate-400'}`}>
                {connected ? <CheckCircle2 size={16} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                {!status ? 'Verifica in corso…' : !status.installed ? `CLI ${status.label} non trovata` : connected ? 'Autenticato' : 'Non autenticato'}
              </span>
              <div className="flex gap-2">
                <button type="button" className={buttonClass} onClick={refreshStatus}>Verifica</button>
                {status?.installed && !connected && <button type="button" className="rounded-md bg-violet-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-violet-500" disabled={loggingIn} onClick={login}>{loggingIn ? 'In attesa del browser…' : 'Accedi'}</button>}
              </div>
            </div>
          )}

          {native && loggingIn && loginInfo?.needsCode && (
            <div className="grid gap-2 text-sm text-slate-300">
              <p>Completa l'accesso nel browser, poi incolla qui il codice mostrato.</p>
              <div className="flex gap-2">
                <input value={loginCode} onChange={(event) => setLoginCode(event.target.value)} className={fieldClass} placeholder="Codice di autorizzazione" />
                <button type="button" className={`${buttonClass} mt-2`} disabled={!loginCode.trim()} onClick={sendCode}>Invia</button>
              </div>
            </div>
          )}
          {native && loggingIn && loginInfo?.url && (
            <p className="break-all text-xs text-slate-500">Il browser non si è aperto? <a href={loginInfo.url} target="_blank" rel="noreferrer" className="text-cyan-400 underline">Apri il link di accesso</a></p>
          )}

          {cloud && (
            <label className="text-sm text-slate-300">
              API key Ollama Cloud {hasSavedKey && <span className="text-emerald-400">(salvata)</span>}
              <div className="flex gap-2">
                <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className={fieldClass} placeholder={hasSavedKey ? '••••••••' : 'Incolla la API key'} />
                <button type="button" className={`${buttonClass} mt-2`} disabled={!apiKey.trim() && !hasSavedKey} onClick={saveKey}>{apiKey.trim() ? 'Salva' : 'Rimuovi'}</button>
              </div>
            </label>
          )}

          {provider === 'ollama' && (
            <label className="text-sm text-slate-300">
              Endpoint Ollama
              <div className="flex gap-2">
                <input value={config.endpoint || ''} onChange={(event) => updateConfig({ endpoint: event.target.value })} className={fieldClass} />
                <button type="button" className={`${buttonClass} mt-2`} disabled={modelsLoading} onClick={() => loadModels()}>{modelsLoading ? 'Connessione…' : 'Connetti'}</button>
              </div>
            </label>
          )}

          <label className="text-sm text-slate-300">
            Modello
            <div className="flex gap-2">
              <select className={fieldClass} value={config.model || ''} onChange={(event) => updateConfig({ model: event.target.value })}>
                <option value="">{modelsLoading ? 'Caricamento…' : native ? 'Predefinito del client' : 'Seleziona un modello'}</option>
                {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
              <button type="button" aria-label="Aggiorna modelli" title="Aggiorna modelli" className={`${buttonClass} mt-2`} disabled={modelsLoading} onClick={() => loadModels()}><RefreshCw size={16} className={modelsLoading ? 'animate-spin' : ''} /></button>
            </div>
          </label>

          <label className="text-sm text-slate-300">
            Ragionamento
            <select className={fieldClass} value={config.reasoning || reasoningByProvider[provider][0].value} onChange={(event) => updateConfig({ reasoning: event.target.value })}>
              {reasoningByProvider[provider].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      )}
    </section>
  )
}
