import { t } from './i18n/index.js'
import { getPreference, setPreference } from './lib/preferences.js'
const STORAGE_KEY = 'openwriter.appearance'

export const themes = [
  { value: 'system', label: t('System') },
  { value: 'dark', label: t('Dark') },
  { value: 'light', label: t('Light') },
]

export const accents = [
  { value: 'ash', label: t('Ash'), swatch: '#a3a39f' },
  { value: 'violet', label: t('Violet'), swatch: '#8b5cf6' },
  { value: 'cyan', label: t('Cyan'), swatch: '#06b6d4' },
  { value: 'emerald', label: t('Emerald'), swatch: '#10b981' },
  { value: 'rose', label: t('Rose'), swatch: '#f43f5e' },
  { value: 'amber', label: t('Amber'), swatch: '#f59e0b' },
]

export const fonts = [
  { value: 'sans', label: t('Sans-serif'), family: 'ui-sans-serif, system-ui, sans-serif' },
  { value: 'serif', label: t('Serif'), family: 'Georgia, Cambria, "Times New Roman", serif' },
  { value: 'mono', label: t('Monospace'), family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
]

export const lineHeights = [
  { value: 'compact', label: t('Compact'), size: 1.5 },
  { value: 'normal', label: t('Normal'), size: 1.75 },
  { value: 'relaxed', label: t('Relaxed'), size: 2 },
]

export const widths = [
  { value: 'narrow', label: t('Narrow'), size: '40rem' },
  { value: 'medium', label: t('Medium|width'), size: '56rem' },
  { value: 'full', label: t('Full'), size: '100%' },
]

export const fontSizeRange = { min: 14, max: 24 }

// `fontFamily`: un carattere installato scelto per nome (facoltativo): il tipo generico `font` fa da ripiego. Solo estetico: non entra nel documento.
export const defaultAppearance = { theme: 'system', accent: 'ash', font: 'sans', fontFamily: '', fontSize: 17, lineHeight: 'normal', width: 'medium' }

// Nome di un carattere: testo libero senza i caratteri che romperebbero il valore CSS.
// Lo spazio finale non si toglie: mentre si digita "Palatino " serve; si toglie quando il nome viene usato.
const cleanFamily = (value) => { const name = String(value ?? ''); return name.length <= 80 && !/["';:{}<>\\\n]/.test(name) ? name : '' }

const pick = (options, value, fallback) => (options.some((option) => option.value === value) ? value : fallback)

function normalize(value = {}) {
  const size = Number(value.fontSize)
  return {
    theme: pick(themes, value.theme, defaultAppearance.theme),
    accent: pick(accents, value.accent, defaultAppearance.accent),
    font: pick(fonts, value.font, defaultAppearance.font),
    fontFamily: cleanFamily(value.fontFamily),
    fontSize: Number.isFinite(size) ? Math.min(fontSizeRange.max, Math.max(fontSizeRange.min, Math.round(size))) : defaultAppearance.fontSize,
    lineHeight: pick(lineHeights, value.lineHeight, defaultAppearance.lineHeight),
    width: pick(widths, value.width, defaultAppearance.width),
  }
}

export function loadAppearance() {
  try { return normalize(JSON.parse(getPreference(STORAGE_KEY))) } catch { return { ...defaultAppearance } }
}

export function saveAppearance(appearance) {
  try { setPreference(STORAGE_KEY, JSON.stringify(appearance)) } catch {}
}

const systemQuery = window.matchMedia('(prefers-color-scheme: dark)')

// Scrive le impostazioni come attributi e variabili CSS sulla radice del documento.
export function applyAppearance(appearance) {
  const root = document.documentElement
  const theme = appearance.theme === 'system' ? (systemQuery.matches ? 'dark' : 'light') : appearance.theme
  root.dataset.theme = theme
  root.dataset.accent = appearance.accent
  const generic = fonts.find((font) => font.value === appearance.font).family
  const family = appearance.fontFamily.trim()
  root.style.setProperty('--editor-font', family ? `"${family}", ${generic}` : generic)
  root.style.setProperty('--editor-size', `${appearance.fontSize / 16}rem`)
  root.style.setProperty('--editor-line-height', String(lineHeights.find((item) => item.value === appearance.lineHeight).size))
  root.style.setProperty('--editor-width', widths.find((item) => item.value === appearance.width).size)
}

let current = loadAppearance()
const listeners = new Set()

export const getAppearance = () => current

export function updateAppearance(changes) {
  current = normalize({ ...current, ...changes })
  saveAppearance(current)
  applyAppearance(current)
  listeners.forEach((listener) => listener(current))
}

export function subscribeAppearance(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Con tema "Sistema" segue i cambi del sistema operativo.
systemQuery.addEventListener('change', () => { if (current.theme === 'system') applyAppearance(current) })
applyAppearance(current)
