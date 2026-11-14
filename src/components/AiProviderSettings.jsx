import { useCallback, useEffect, useState } from 'react'
import { Bot, CheckCircle2, RefreshCw } from 'lucide-react'
import { reasoningByProvider } from '../lib/aiOptions.js'
import ParameterSlider, { InfoTip } from './ParameterSlider.jsx'
import { t } from '../i18n/index.js'
import { toolOptions } from '../lib/toolOptions.js'
import ModelPicker from './ModelPicker.jsx'
import Switch from './Switch.jsx'
import ProviderCards, { providers } from './ProviderCards.jsx'

const electronAPI = window.electronAPI
const ai = electronAPI?.ai

// Provider che si usano con una chiave API salvata dall'app.
const keyProviders = ['ollama-cloud', 'openrouter', 'gemini']
const languages = ['Italiano', 'English', 'Español', 'Français', 'Deutsch', 'Português']

// Provider con chiamate native agli strumenti, ammessi per l'assistente di ricerca.
const RESEARCH_PROVIDERS = ['ollama', 'ollama-cloud', 'openrouter', 'gemini']

const fieldClass = 'mt-2 w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2.5 text-slate-100 outline-none placeholder:text-slate-500 focus:border-accent-400 disabled:opacity-60'
const buttonClass = 'rounded-md bg-slate-700 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-slate-600 disabled:cursor-wait disabled:opacity-60'

// `project`: { directory, choice, onChoice } quando la pagina è nella finestra di un progetto. È la stessa pagina: chiavi API, endpoint e accesso ai client restano le impostazioni
// del computer e si cambiano da entrambe; provider, modello e ragionamento, nel progetto, diventano la scelta di quel progetto (vedi model-choice.cjs).
export default function AiProviderSettings({ project = null }) {
  const [settings, setSettings] = useState(null)
  const [autoApprove, setAutoApprove] = useState(() => window.electronAPI?.preferences?.values?.['openwriter.autoApprove'] === 'on')
  const [models, setModels] = useState([])
  const [modelsLoading, setModelsLoading] = useState(false)
  // Cambia a ogni ricarica dei modelli, così il selettore rilegge anche cosa accettano.
  const [modelsVersion, setModelsVersion] = useState(0)
  const [status, setStatus] = useState(null)
  const [apiKey, setApiKey] = useState('')
  const [savedKeys, setSavedKeys] = useState({})
  const [capabilities, setCapabilities] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!ai) return
    ai.getSettings().then(setSettings)
    Promise.all(keyProviders.map((name) => ai.hasApiKey(name)))
      .then((values) => setSavedKeys(Object.fromEntries(keyProviders.map((name, index) => [name, Boolean(values[index])]))))
  }, [])

  // La scelta del progetto, se c'è: provider, modello e ragionamento vengono da lì; il resto della configurazione del provider resta quello generale.
  const choice = project?.choice || null
  const provider = choice ? choice.provider : settings?.provider
  const general = settings?.providers?.[provider] || {}
  const config = choice
    ? { ...general, ...(choice.params || {}), model: choice.model || general.model, reasoning: reasoningByProvider[provider]?.some((option) => option.value === choice.reasoning) ? choice.reasoning : general.reasoning }
    : general
  const native = provider === 'codex' || provider === 'claude'
  const cliTemperatureNote = t('Claude and Codex have no temperature setting. The temperature chosen in the project settings reaches them only as a style hint in the prompt, and only at the extremes (very low or very high).')
  const cloud = provider === 'ollama-cloud'
  const openRouter = provider === 'openrouter'
  const gemini = provider === 'gemini'
  const hasSavedKey = Boolean(savedKeys[provider])

  const persist = useCallback((next) => {
    setSettings(next)
    ai.saveSettings(next).catch((reason) => setError(reason.message))
  }, [])

  // Assistente di ricerca: un secondo modello (solo provider con strumenti nativi) che l'assistente principale chiama come strumento.
  const researcher = settings?.researcher || { enabled: false, provider: 'ollama-cloud', model: '', maxSteps: 12 }
  const [researchModels, setResearchModels] = useState([])
  const [researchLoading, setResearchLoading] = useState(false)
  const researchEndpoint = settings?.providers?.[researcher.provider]?.endpoint
  useEffect(() => {
    if (!settings?.aiEnabled || !researcher.enabled) return undefined
    let cancelled = false
    setResearchLoading(true)
    ai.listModels({ provider: researcher.provider, endpoint: researchEndpoint })
      .then((list) => { if (!cancelled) setResearchModels(list) })
      .catch(() => { if (!cancelled) setResearchModels([]) })
      .finally(() => { if (!cancelled) setResearchLoading(false) })
    return () => { cancelled = true }
  }, [settings?.aiEnabled, researcher.enabled, researcher.provider, researchEndpoint])
  const updateResearcher = (changes) => persist({ ...settings, researcher: { ...researcher, ...changes } })

  async function saveChoice(next) {
    try { project.onChoice(await electronAPI.setProjectModelChoiceFor(project.directory, next)) } catch (reason) { setError(reason.message) }
  }
  const updateConfig = (changes) => {
    if (!project) { persist({ ...settings, providers: { ...settings.providers, [provider]: { ...config, ...changes } } }); return }
    // Nel progetto, modello, ragionamento e parametri di generazione sono la scelta del progetto; l'endpoint è del computer e resta generale.
    const { model, reasoning, endpoint, ...params } = changes
    if (model !== undefined || reasoning !== undefined || Object.keys(params).length) {
      saveChoice({ provider, model: model ?? config.model ?? '', reasoning: reasoning ?? config.reasoning ?? '', params: { ...(choice?.params || {}), ...params } })
    }
    if (endpoint !== undefined) persist({ ...settings, providers: { ...settings.providers, [provider]: { ...general, endpoint } } })
  }
  const chooseProvider = (value) => {
    if (!project) { persist({ ...settings, provider: value }); return }
    const base = settings.providers[value] || {}
    saveChoice({ provider: value, model: base.model || '', reasoning: base.reasoning || '' })
  }

  const loadModels = useCallback(async (request = {}) => {
    setModelsLoading(true)
    setError('')
    try {
      setModels(await ai.listModels({ provider, endpoint: config.endpoint, ...request }))
      setModelsVersion((value) => value + 1)
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
    setApiKey('')
    if (native) refreshStatus()
    if ((provider !== 'ollama-cloud' && provider !== 'gemini') || hasSavedKey) loadModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.aiEnabled, provider, hasSavedKey])

  // Il modello scelto sa guardare le immagini? Serve per l'opzione "Immagini e schermate".
  useEffect(() => {
    if (!settings?.aiEnabled || !provider) return
    ai.getCapabilities(config.model, provider).then(setCapabilities).catch(() => setCapabilities(null))
  }, [settings?.aiEnabled, provider, config.model])

  async function saveKey() {
    try {
      await ai.saveApiKey(apiKey, provider)
      setSavedKeys((current) => ({ ...current, [provider]: Boolean(apiKey.trim()) }))
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
      {project && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-xs text-slate-400">
          <span>{choice ? t('This project uses its own provider and model.') : t('Inherited from the general settings: changing the provider or its settings here applies to this project only. Keys and endpoints are the same everywhere.')}</span>
          {choice && <button type="button" className="shrink-0 rounded-md bg-slate-700 px-3 py-1.5 font-medium text-slate-100 transition hover:bg-slate-600" onClick={() => saveChoice(null)}>{t('Use the general settings')}</button>}
        </div>
      )}
      {project && !settings.aiEnabled && <p className="mt-4 text-xs text-slate-500">{t('Turning the assistant on or off applies to every project; the choices below are those of this project.')}</p>}

      {settings.aiEnabled && (
        <div className="mt-6 grid grid-cols-1 gap-4">
          <div className="grid gap-2">
            <span className="text-sm text-slate-300">{t('Provider')}</span>
            <ProviderCards value={provider} onChange={chooseProvider} />
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

          {(cloud || openRouter || gemini) && (
            <label className="text-sm text-slate-300">{cloud ? t('Ollama Cloud API key') : gemini ? t('Gemini API key') : t('OpenRouter API key')} {hasSavedKey && <span className="text-emerald-400">{t('(saved)')}</span>}
              <div className="flex gap-2">
                <input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} className={fieldClass} placeholder={hasSavedKey ? '••••••••' : t('Paste the API key')} />
                <button type="button" className={`${buttonClass} mt-2`} disabled={!apiKey.trim() && !hasSavedKey} onClick={saveKey}>{apiKey.trim() ? t('Save') : t('Remove')}</button>
              </div>
              {openRouter && !hasSavedKey && (
                <span className="mt-2 block text-xs text-slate-500">{t('You can create a key on')} <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer" className="text-accent-400 underline">openrouter.ai/keys</a></span>
              )}
              {gemini && !hasSavedKey && (
                <span className="mt-2 block text-xs text-slate-500">{t('You can create a key on')} <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-accent-400 underline">aistudio.google.com/apikey</a></span>
              )}
            </label>
          )}

          {provider === 'ollama' && (
            <label className="text-sm text-slate-300">{t('Ollama endpoint')}<div className="flex gap-2">
                <input value={config.endpoint || ''} onChange={(event) => updateConfig({ endpoint: event.target.value })} className={fieldClass} />
                <button type="button" className={`${buttonClass} mt-2`} disabled={modelsLoading} onClick={() => loadModels()}>{modelsLoading ? t('Connecting…') : t('Connect')}</button>
              </div>
            </label>
          )}

          <div className="text-sm text-slate-300">{t('Model')}<div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <ModelPicker
                  value={config.model || ''}
                  models={models}
                  emptyLabel={modelsLoading ? t('Loading…') : native ? t('Client default') : t('Select a model')}
                  cacheKey={`${provider}|${config.endpoint || ''}|${modelsVersion}`}
                  loadInputs={() => ai.listModelInputs({ provider, endpoint: config.endpoint })}
                  onChange={(model) => updateConfig({ model })}
                />
              </div>
              <button type="button" aria-label={t('Refresh models')} title={t('Refresh models')} className={`${buttonClass} mt-2`} disabled={modelsLoading} onClick={() => loadModels()}><RefreshCw size={16} className={modelsLoading ? 'animate-spin' : ''} /></button>
            </div>
          </div>

          {!project && (
            <label className="text-sm text-slate-300">{t('Reply language')}<select className={fieldClass} value={settings.language} onChange={(event) => persist({ ...settings, language: event.target.value })}>
                <option value="">{t('Same as the interface')}</option>
                {[...new Set([...languages, settings.language].filter(Boolean))].map((language) => <option key={language} value={language}>{language}</option>)}
              </select>
            </label>
          )}

          <label className="text-sm text-slate-300">{t('Reasoning')}<select className={fieldClass} value={config.reasoning || reasoningByProvider[provider][0].value} onChange={(event) => updateConfig({ reasoning: event.target.value })}>
              {reasoningByProvider[provider].map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>

          {(provider === 'ollama' || cloud || openRouter || gemini) && (
            <details className="rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
              <summary className="cursor-pointer select-none text-slate-300">{t('Advanced')}</summary>
              <p className="mt-2 text-xs text-slate-500">{t('Generation parameters sent with every request. Leave a field empty to use the model\'s default.')}</p>
              <div className="mt-3 grid gap-4">
                {!openRouter && !gemini && <ParameterSlider id="ollama-num-ctx" label={t('Context window (num_ctx)')} help={t('How much text the model can keep in mind at once: your documents, the conversation and the instructions together. Larger values let the assistant read longer documents but use more memory and make replies slower. Typical values: 4096 to 32768.')} value={config.numCtx} onChange={(value) => updateConfig({ numCtx: value })} stops={[512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072]} format={(value) => value.toLocaleString()} />}
                <ParameterSlider id="ollama-num-predict" label={openRouter || gemini ? t('Maximum reply tokens (max_tokens)') : t('Maximum reply tokens (num_predict)')} help={t('Upper limit on the length of a single reply, in tokens (about three quarters of a word each). Lower it to keep replies short and fast; if replies are cut off, raise it. Reasoning models count their thinking too.')} value={config.numPredict} onChange={(value) => updateConfig({ numPredict: value })} stops={[64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768]} format={(value) => value.toLocaleString()} />
                {!project && <ParameterSlider id="ollama-temperature" label={t('Temperature')} help={t('How much freedom the model takes. Low values (0 to 0.3) give precise, repeatable replies, good for proofreading; high values (0.8 to 1.5) give more varied, creative wording. Above 1.5 the text may become incoherent.')} value={config.temperature} onChange={(value) => updateConfig({ temperature: value })} min={0} max={2} step={0.1} format={(value) => value.toFixed(1)} />}
                {provider === 'ollama' && (
                  <div className="relative block text-xs text-slate-400">
                    <div className="flex items-center gap-1.5">
                      <label htmlFor="ollama-keep-alive">{t('Keep the model loaded (keep_alive)')}</label>
                      <InfoTip text={t('How long Ollama keeps the model in memory after a reply, so the next one starts at once. Use a number of seconds or a value like 5m or 1h; 0 unloads it immediately and -1 keeps it loaded.')} />
                    </div>
                    <input id="ollama-keep-alive" placeholder={t('Default (5m)')} value={config.keepAlive ?? ''} className={fieldClass} onChange={(event) => updateConfig({ keepAlive: event.target.value })} />
                  </div>
                )}
              </div>
              {!openRouter && !gemini && <p className="mt-2 text-xs text-slate-500">{t('A smaller context window and a lower token limit make replies faster; a larger window lets the assistant see more of the documents. Ollama Cloud may ignore some of these.')}</p>}
            </details>
          )}

          {provider === 'codex' && (
            <details className="rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
              <summary className="cursor-pointer select-none text-slate-300">{t('Advanced')}</summary>
              <label className="mt-3 block">{t('Codex sandbox')}
                <select className={fieldClass} value={config.sandbox || 'workspace-write'} onChange={(event) => updateConfig({ sandbox: event.target.value })}>
                  <option value="read-only">{t('Read-only')}</option>
                  <option value="workspace-write">{t('Workspace write (default)')}</option>
                  <option value="danger-full-access">{t('No sandbox')}</option>
                </select>
              </label>
              <p className="mt-2 text-xs text-slate-500">{t('OpenWriter already turns off Codex\'s own shell, apps and browser: the assistant works only through OpenWriter\'s tools, which run in the app, outside this sandbox. The sandbox only limits commands Codex would run by itself.')}</p>
              {config.sandbox === 'danger-full-access' && (
                <p className="mt-2 text-xs text-amber-400">{t('Without a sandbox, if Codex ever runs commands, they would have full access to your files. Use it only if the sandbox gets in the way.')}</p>
              )}
              <p className="mt-2 text-xs text-slate-500">{cliTemperatureNote}</p>
            </details>
          )}

          {provider === 'claude' && (
            <details className="rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
              <summary className="cursor-pointer select-none text-slate-300">{t('Advanced')}</summary>
              <p className="mt-3 text-xs text-slate-500">{cliTemperatureNote}</p>
            </details>
          )}

          {!project && (
            <>
          <fieldset className="grid gap-3 rounded-lg border border-slate-800 p-4">
            <legend className="px-1 text-sm text-slate-300">{t('Assistant tools')}</legend>
            {toolOptions.map(({ key, label, help }) => (
              <label key={key} className="flex items-start gap-3 text-sm text-slate-300">
                <Switch checked={Boolean(settings.tools?.[key])} onChange={(value) => persist({ ...settings, tools: { ...settings.tools, [key]: value } })} />
                <span>{label}<span className="block text-xs text-slate-500">{help}</span></span>
              </label>
            ))}
            <label className="flex items-start gap-3 border-t border-slate-800 pt-3 text-sm text-slate-300">
              <Switch checked={autoApprove} onChange={(value) => { setAutoApprove(value); window.electronAPI.preferences?.set('openwriter.autoApprove', value ? 'on' : 'off'); if (window.electronAPI.preferences?.values) window.electronAPI.preferences.values['openwriter.autoApprove'] = value ? 'on' : 'off' }} />
              <span>{t('Approve the assistant\'s edits for me')}<span className="block text-xs text-slate-500">{t('Default for all projects; each project can choose differently in its settings or from the chat options.')}</span></span>
            </label>
            <label className="flex items-start justify-between gap-3 border-t border-slate-800 pt-3 text-sm text-slate-300">
              <span>{t('Reasoning with the tools')}<span className="block text-xs text-slate-500">{t('After the result of a tool the plan is already made: reasoning less makes the work faster. The level set above applies to the first step of each request.')}</span>
              </span>
              <select className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-accent-400" value={settings.toolReasoning || 'reduced'} onChange={(event) => persist({ ...settings, toolReasoning: event.target.value })}>
                <option value="reduced">{t('Reduced')}</option>
                <option value="none">{t('Off, where possible')}</option>
                <option value="same">{t('Same as set')}</option>
              </select>
            </label>
            <label className="flex items-start justify-between gap-3 border-t border-slate-800 pt-3 text-sm text-slate-300">
              <span>{t('Maximum steps with the tools')}<span className="block text-xs text-slate-500">{t('How many tool calls the assistant can chain for each request. At the limit it asks whether to continue.')}</span>
              </span>
              <select className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-accent-400" value={settings.maxToolSteps} onChange={(event) => persist({ ...settings, maxToolSteps: Number(event.target.value) })}>
                {[...new Set([5, 8, 10, 15, 20, 30, 50, settings.maxToolSteps])].sort((left, right) => left - right).map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <div className="grid gap-2 border-t border-slate-800 pt-3 text-sm text-slate-300">
              <label className="flex items-start gap-2">
                <Switch checked={Boolean(settings.autoContinue)} onChange={(value) => persist({ ...settings, autoContinue: value })} />
                <span>{t('Continue automatically after a countdown')}<span className="block text-xs text-slate-500">{t('When the step limit is reached, the assistant continues by itself after the countdown, so unattended work does not stay waiting for you. Click the question to stop the countdown.')}</span></span>
              </label>
              {settings.autoContinue && (
                <label className="flex items-center justify-between gap-3 pl-6">
                  <span>{t('Countdown')}</span>
                  <select className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-accent-400" value={settings.autoContinueSeconds} onChange={(event) => persist({ ...settings, autoContinueSeconds: Number(event.target.value) })}>
                    {[...new Set([5, 10, 20, 30, 60, 120, settings.autoContinueSeconds])].sort((left, right) => left - right).map((value) => <option key={value} value={value}>{t('{count} seconds', { count: value })}</option>)}
                  </select>
                </label>
              )}
            </div>
            {settings.tools?.vision && capabilities && !capabilities.vision && (
              <p className="text-xs text-amber-400">{capabilities.known ? t('The selected model does not support images: the image and screenshot tools stay off.') : t('I cannot check whether the model supports images: the image and screenshot tools stay off.')}</p>
            )}
            <p className="text-xs text-slate-500">{t('The tools work with every provider, but small models may use them less reliably.')}</p>
          </fieldset>

          <fieldset className="grid gap-3 rounded-lg border border-slate-800 p-4">
            <legend className="px-1 text-sm font-medium text-slate-200">{t('Research assistant')}</legend>
            <label className="flex items-start gap-2 text-sm text-slate-300">
              <Switch checked={researcher.enabled} onChange={(value) => updateResearcher({ enabled: value })} />
              <span>{t('Delegate the research to another dedicated assistant')}</span>
            </label>
            {researcher.enabled && (
              <>
                <label className="flex items-center justify-between gap-3 text-sm text-slate-300">
                  <span>{t('Provider')}</span>
                  <select className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-accent-400" value={researcher.provider} onChange={(event) => updateResearcher({ provider: event.target.value, model: '' })}>
                    {providers.filter((item) => RESEARCH_PROVIDERS.includes(item.value)).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                <div className="text-sm text-slate-300">{t('Model')}
                  <ModelPicker
                    value={researcher.model}
                    models={researchModels}
                    emptyLabel={researchLoading ? t('Loading…') : t('Select a model')}
                    cacheKey={`research|${researcher.provider}|${researchEndpoint || ''}`}
                    loadInputs={() => ai.listModelInputs({ provider: researcher.provider, endpoint: researchEndpoint })}
                    onChange={(model) => updateResearcher({ model })}
                  />
                </div>
                <label className="flex items-start justify-between gap-3 text-sm text-slate-300">
                  <span>{t('Maximum research steps')}</span>
                  <select className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-slate-100 outline-none focus:border-accent-400" value={researcher.maxSteps} onChange={(event) => updateResearcher({ maxSteps: Number(event.target.value) })}>
                    {[...new Set([4, 6, 8, 12, 16, 24, 30, researcher.maxSteps])].sort((left, right) => left - right).map((value) => <option key={value} value={value}>{value}</option>)}
                  </select>
                </label>
                <p className="text-xs text-slate-500">{t('The API key and the endpoint of the chosen provider are the ones set for it above: configure it first if you have not used it yet.')}</p>
              </>
            )}
          </fieldset>

            </>
          )}

          {error && <p className="text-sm text-rose-400">{error}</p>}
        </div>
      )}
    </section>
  )
}
