import { t } from '../i18n/index.js'
import { getPreference, setPreference } from './preferences.js'

/**
 * Quando l'app controlla da sola se c'è una nuova versione (GitHub, in silenzio: avvisa solo se ne trova una).
 * `never`: solo a richiesta; `startup`: all'avvio (comportamento di prima); gli altri: all'avvio e poi a intervalli, finché l'app resta aperta.
 */
const STORAGE_KEY = 'openwriter.updateCheck'
const HOUR = 60 * 60 * 1000

export const updateSchedules = [
  { value: 'never', label: t('Never (only when I ask)'), interval: 0 },
  { value: 'startup', label: t('At startup'), interval: 0 },
  { value: '1h', label: t('Every hour'), interval: HOUR },
  { value: '6h', label: t('Every 6 hours'), interval: 6 * HOUR },
  { value: '1d', label: t('Every day'), interval: 24 * HOUR },
  { value: '1w', label: t('Every week'), interval: 7 * 24 * HOUR },
]

export const DEFAULT_UPDATE_SCHEDULE = 'startup'

const listeners = new Set()
let current = (() => {
  const saved = getPreference(STORAGE_KEY)
  return updateSchedules.some((item) => item.value === saved) ? saved : DEFAULT_UPDATE_SCHEDULE
})()

export const getUpdateSchedule = () => current
export const scheduleOf = (value) => updateSchedules.find((item) => item.value === value) || updateSchedules[1]

export function setUpdateSchedule(value) {
  if (!updateSchedules.some((item) => item.value === value)) return
  current = value
  setPreference(STORAGE_KEY, value)
  listeners.forEach((listener) => listener(current))
}

export function subscribeUpdateSchedule(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
