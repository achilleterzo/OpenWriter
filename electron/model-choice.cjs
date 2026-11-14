/**
 * Scelta del modello AI per un progetto (o per una conversazione): { provider, model, reasoning }.
 * Il progetto la salva nel proprio `project.json`; la conversazione nel proprio file. Contiene solo nomi: chiavi API, endpoint e parametri
 * avanzati restano nelle impostazioni generali, sul computer.
 */
const PROVIDERS = ['ollama', 'ollama-cloud', 'openrouter', 'codex', 'claude', 'gemini']

// Un nome di modello o di livello è testo semplice: niente caratteri di controllo, lunghezza ragionevole.
const plain = (value, limit) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, limit)

// I parametri di generazione che un progetto può avere per conto proprio (vuoto = predefinito del modello). Chiavi, endpoint e accesso ai client non ci sono: sono del computer.
const whole = (value, min, max) => {
  const number = Math.round(Number(value))
  return value !== '' && value != null && Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : ''
}
const SANDBOXES = ['read-only', 'workspace-write', 'danger-full-access']
function cleanParams(value) {
  if (!value || typeof value !== 'object') return {}
  const params = {}
  if ('numPredict' in value) params.numPredict = whole(value.numPredict, 1, 131072)
  if ('numCtx' in value) params.numCtx = whole(value.numCtx, 512, 1048576)
  if ('keepAlive' in value) params.keepAlive = /^-?\d+(?:[smh])?$/.test(String(value.keepAlive || '').trim()) ? String(value.keepAlive).trim() : ''
  if (SANDBOXES.includes(value.sandbox)) params.sandbox = value.sandbox
  return params
}

/** Una scelta pulita, oppure null quando non c'è un provider valido (= nessuna scelta, valgono le impostazioni generali). */
function cleanModelChoice(value) {
  if (!value || typeof value !== 'object' || !PROVIDERS.includes(value.provider)) return null
  return { provider: value.provider, model: plain(value.model, 200), reasoning: plain(value.reasoning, 30), params: cleanParams(value.params) }
}

/**
 * Le impostazioni generali con sopra la scelta. `reasoningLevels`: { [provider]: [livelli ammessi] }.
 * `usable(provider)`: false se il provider non si può usare su questo computer (chiave mancante): in quel caso restano le impostazioni generali.
 * I parametri della scelta (`params`) prevalgono su quelli generali del provider. Il modello vuoto lascia quello generale del provider, e un livello di ragionamento che il provider non ha si ignora.
 */
function applyModelChoice(settings, choice, { reasoningLevels = {}, usable = () => true } = {}) {
  const clean = cleanModelChoice(choice)
  if (!clean || !usable(clean.provider)) return settings
  const general = settings.providers?.[clean.provider] || {}
  const reasoning = (reasoningLevels[clean.provider] || []).includes(clean.reasoning) ? clean.reasoning : general.reasoning
  return {
    ...settings,
    provider: clean.provider,
    providers: { ...settings.providers, [clean.provider]: { ...general, ...clean.params, model: clean.model || general.model, reasoning } },
  }
}

module.exports = { PROVIDERS, cleanModelChoice, applyModelChoice }
