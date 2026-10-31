import { t } from '../i18n/index.js'

// Temperatura del progetto: il cursore è continuo, le parole da "Precise" a "Wild" nominano solo la fascia in cui cade il valore.
export const TEMPERATURE_MIN = 0
export const TEMPERATURE_MAX = 2
export const TEMPERATURE_STEP = 0.05

// Limite superiore di ogni fascia, nell'ordine delle etichette di `temperatureLabel`.
const BAND_LIMITS = [0.35, 0.65, 1, 1.4]

export function temperatureLabel(value) {
  const index = BAND_LIMITS.findIndex((limit) => value < limit)
  const labels = [t('Precise'), t('Careful'), t('Balanced'), t('Creative'), t('Wild')]
  return labels[index === -1 ? BAND_LIMITS.length : index]
}

export const formatTemperature = (value) => `${temperatureLabel(value)} · ${value.toFixed(2)}`
