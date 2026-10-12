import { useCallback, useEffect, useState } from 'react'
import { Bot, CheckCircle2, RefreshCw } from 'lucide-react'
import { reasoningByProvider } from '../lib/aiOptions.js'
import ollamaLogo from '../assets/provider-logos/ollama.svg'
import codexLogo from '../assets/provider-logos/codex.svg'
import claudeCodeLogo from '../assets/provider-logos/claude-code.svg'
import { t } from '../i18n/index.js'

const ai = window.electronAPI?.ai

const providers = [
  { value: 'ollama', label: 'Ollama', description: t('Local HTTP service') },
  { value: 'ollama-cloud', label: 'Ollama Cloud', description: t('Hosted API with an API key') },
  { value: 'codex', label: 'Codex', description: t('Native CLI with ChatGPT OAuth') },
  { value: 'claude', label: 'Claude', description: t('Native CLI with Claude OAuth') },
]
const logos = { ollama: ollamaLogo, 'ollama-cloud': ollamaLogo, codex: codexLogo, claude: claudeCodeLogo }
const languages = ['Italiano', 'English', 'Español', 'Français', 'Deutsch', 'Português']
const toolOptions = [
  { key: 'files', label: t('Project files'), help: t('List folders and read the project\'s files (the .ow folder is excluded).') },
  { key: 'create', label: t('Creating files and folders'), help: t('Create folders and new Markdown or text documents in the project, to write documents there. Existing files are never overwritten.') },
  { key: 'memory', label: t('Memory'), help: t('Lets the assistant save important information about the project (decisions, terminology, style choices), linked to the files it applies to, and re-read it in every conversation. You can inspect and edit it in the Memory tab.') },
  { key: 'notes', label: t('Notes in the document'), help: t('Add notes and suggestions anchored to the text, which you accept or reject, and consult them.') },
  { key: 'edit', label: t('Editing the open document'), help: t('Replace or insert text. Edits can be undone with Ctrl+Z, they are not saved on their own, and a version is archived before the first edit.') },
  { key: 'ask', label: t('Questions with choices'), help: t('The assistant can ask you questions with clickable answers (paged, with "Other" to write your own), instead of listing the options in the text.') },
  { key: 'vision', label: t('Images and screenshots'), help: t('Look at screenshots of the document and of the browser tabs, and at images from pages, links or project files. Requires a model with vision; images are sent to the chosen provider and, for those on the web, downloaded by your computer (local addresses are blocked).') },
  { key: 'web', label: t('Web browsing'), help: t('Search with DuckDuckGo, open pages and read the Browser tabs, including the ones you opened yourself (even pages where you are signed in). Searches and addresses leave your computer; it cannot open local addresses.') },
]

const fieldClass = 'mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400 disabled:opacity-60'
const buttonClass = 'rounded-md bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-slate-600 disabled:cursor-wait disabled:opacity-60'

export default function AiProviderSettings() {
  const [settings, setSettings] = useState(null)
  const [models, setModels] = useState([])
  const [modelsLoading, setModelsLoading] = useState(false)
  const [status, setStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [hasSavedKey, setHasSavedKey] = useState(false)
  const [capabilities, setCapabilities] = useState(null)
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

  // Il modello scelto sa guardare le immagini? Serve per l'opzione "Immagini e schermate".
  useEffect(() => {
    if (!settings?.aiEnabled || !provider) return
    ai.getCapabilities().then(setCapabilities).catch(() => setCapabilities(null))
  }, [settings?.aiEnabled, provider, config.model])

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
      if (result.started === false) throw new Error(result.error || t('Could not start the sign-in'))
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
    return <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-300">{t('The Electron process is out of date: restart the app (npm run dev) to load the new preload.')}</p>
  }
  if (!settings) return null

  const connected = status?.provider === provider && status.authenticated
  const modelOptions = [...new Set([config.model, ...models].filter(Boolean))]

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Bot className="text-accent-400" size={20} />
            <h2 className="text-lg font-semibold">{t('AI assistant')}</h2>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">{t('Provider used for writing and reviewing texts.')}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.aiEnabled}
          aria-label={t('Enable AI assistant')}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${settings.aiEnabled ? 'bg-accent-600' : 'bg-slate-700'}`}
          onClick={() => persist({ ...settings, aiEnabled: !settings.aiEnabled })}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${settings.aiEnabled ? 'left-[22px]' : 'left-0.5'}`} />
        </button>
      </div>

      {settings.aiEnabled && (
        <div className="mt-6 grid gap-4">
          <div className="grid gap-2">
            <span className="text-sm text-slate-300">{t('Provider')}</span>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label={t('AI provider')}>
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
                {!status ? t('Checking…') : !status.installed ? t('{label} CLI not found', { label: status.label }) : connected ? t('Signed in') : t('Not signed in')}
              </span>
              <div className="flex gap-2">
                <button type="button" className={buttonClass} onClick={refreshStatus}>{t('Check')}</button>
                {status?.installed && !connected && <button type="button" className="rounded-md bg-accent-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-500" disabled={loggingIn} onClick={login}>{loggingIn ? t('Waiting for the browser…') : t('Sign in')}</button>}
              </div>
            </div>
          )}

          {native && loggingIn && loginInfo?.needsCode && (
            <div className="grid gap-2 text-sm text-slate-300">
              <p>{t('Complete the sign-in in the browser, then paste the code shown here.')}</p>
              <div className="flex gap-2">
                <input value={loginCode} onChange={(event) => setLoginCode(event.target.value)} className={fieldClass} placeholder={t('Authorization code')} />
                <button type="button" className={`${buttonClass} mt-2`} disabled={!loginCode.trim()} onClick={sendCode}>{t('Send')}</button>
              </div>
            </div>
          )}
          {native && loggingIn && loginInfo?.url && (
            <p className="break-all text-xs text-slate-500">{t('Did the browser not open?')} <a href={loginInfo.url} target="_blank" rel="noreferrer" className="text-accent-400 underline">{t('Open the sign-in link')}</a></p>
          )}

          {cloud && (
            <label className="text-sm text-slate-300">{t('Ollama Cloud API key')} {hasSavedKey && <span className="text-emerald-400">{t('(saved)')}</span>}
              <div className="flex gap-2">
                <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className={fieldClass} placeholder={hasSavedKey ? '••••••••' : t('Paste the API key')} />
                <button type="button" className={`${buttonClass} mt-2`} disabled={!apiKey.trim() && !hasSavedKey} onClick={saveKey}>{apiKey.trim() ? t('Save') : t('Remove')}</button>
              </div>
            </label>
          )}

          {provider === 'ollama' && (
            <label className="text-sm text-slate-300">{t('Ollama endpoint')}<div className="flex gap-2">
                <input value={config.endpoint || ''} onChange={(event) => updateConfig({ endpoint: event.target.value })} className={fieldClass} />
                <button type="button" className={`${buttonClass} mt-2`} disabled={modelsLoading} onClick={() => loadModels()}>{modelsLoading ? t('Connecting…') : t('Connect')}</button>
              </div>
            </label>
          )}

          <label className="text-sm text-slate-300">{t('Model')}<div className="flex gap-2">
              <select className={fieldClass} value={config.model || ''} onChange={(event) => updateConfig({ model: event.target.value })}>
                <option value="">{modelsLoading ? t('Loading…') : native ? t('Client default') : t('Select a model')}</option>
                {modelOptions.map((model) => <option key={model} value={model}>{model}</option>)}
              </select>
              <button type="button" aria-label={t('Refresh models')} title={t('Refresh models')} className={`${buttonClass} mt-2`} disabled={modelsLoading} onClick={() => loadModels()}><RefreshCw size={16} className={modelsLoading ? 'animate-spin' : ''} /></button>
            </div>
          </label>

          <label className="text-sm text-slate-300">{t('Reply language')}<select className={fieldClass} value={settings.language} onChange={(event) => persist({ ...settings, language: event.target.value })}>
              <option value="">{t('Same as the interface')}</option>
              {[...new Set([...languages, settings.language].filter(Boolean))].map((language) => <option key={language} value={language}>{language}</option>)}
            </select>
          </label>

          <label className="text-sm text-slate-300">{t('Reasoning')}<select className={fieldClass} value={config.reasoning || reasoningByProvider[provider][0].value} onChange={(event) => updateConfig({ reasoning: event.target.value })}>
              {reasoningByProvider[provider].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          <fieldset className="grid gap-3 rounded-lg border border-slate-800 p-4">
            <legend className="px-1 text-sm text-slate-300">{t('Assistant tools')}</legend>
            {toolOptions.map(({ key, label, help }) => (
              <label key={key} className="flex items-start gap-3 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(settings.tools?.[key])}
                  className="mt-1 accent-accent-500"
                  onChange={(event) => persist({ ...settings, tools: { ...settings.tools, [key]: event.target.checked } })}
                />
                <span>{label}<span className="block text-xs text-slate-500">{help}</span></span>
              </label>
            ))}
            <label className="flex items-start justify-between gap-3 border-t border-slate-800 pt-3 text-sm text-slate-300">
              <span>{t('Maximum steps with the tools')}<span className="block text-xs text-slate-500">{t('How many tool calls the assistant can chain for each request. At the limit it asks whether to continue.')}</span>
              </span>
              <select className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-accent-400" value={settings.maxToolSteps} onChange={(event) => persist({ ...settings, maxToolSteps: Number(event.target.value) })}>
                {[...new Set([5, 8, 10, 15, 20, 30, 50, settings.maxToolSteps])].sort((left, right) => left - right).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            {settings.tools?.vision && capabilities && !capabilities.vision && (
              <p className="text-xs text-amber-400">{capabilities.known ? t('The selected model does not support images: the image and screenshot tools stay off.') : t('I cannot check whether the model supports images: the image and screenshot tools stay off.')}</p>
            )}
            <p className="text-xs text-slate-500">{t('The tools work with every provider, but small models may use them less reliably.')}</p>
          </fieldset>

          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      )}
    </section>
  )
}
