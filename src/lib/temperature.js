import { t } from '../i18n/index.js'

// Temperatura di progetto e di conversazione: un livello da 0 a 1, uguale per tutti i provider (ognuno lo converte nel proprio intervallo,
// vedi electron/temperature.cjs: massimi e fasce vanno tenuti allineati). Le parole da "Precise" a "Wild" nominano la fascia in cui cade il livello.
export const TEMPERATURE_MIN = 0
export const TEMPERATURE_MAX = 1
export const TEMPERATURE_STEP = 0.02

const PROVIDER_MAX = { ollama: 4, 'ollama-cloud': 2, openrouter: 2, gemini: 2 }

// Limite superiore di ogni fascia, nell'ordine delle etichette di `temperatureLabel`.
const BAND_LIMITS = [0.2, 0.4, 0.6, 0.8]

export function temperatureLabel(value) {
  const index = BAND_LIMITS.findIndex((limit) => value < limit)
  const labels = [t('Precise'), t('Careful'), t('Balanced'), t('Creative'), t('Wild')]
  return labels[index === -1 ? BAND_LIMITS.length : index]
}

export const formatTemperature = (value) => `${temperatureLabel(value)} · ${value.toFixed(2)}`

// La temperatura generale di un provider (nei suoi gradi, '' = predefinito del modello) espressa come livello; '' se non ha un intervallo (le CLI).
export function levelOf(provider, degrees) {
  const max = PROVIDER_MAX[provider]
  if (!max || degrees === '' || degrees == null || !Number.isFinite(Number(degrees))) return ''
  return Math.min(1, Math.max(0, Math.round((Number(degrees) / max) * 100) / 100))
}

// Il primo livello presente ('' se nessuno): 0 è un livello valido.
export const firstLevel = (...levels) => levels.find((level) => level !== '' && level != null) ?? ''
