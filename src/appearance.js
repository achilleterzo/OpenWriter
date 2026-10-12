const STORAGE_KEY = 'openwriter.appearance'

export const themes = [
  { value: 'system', label: 'Sistema' },
  { value: 'dark', label: 'Scuro' },
  { value: 'light', label: 'Chiaro' },
]

export const accents = [
  { value: 'violet', label: 'Viola', swatch: '#8b5cf6' },
  { value: 'cyan', label: 'Ciano', swatch: '#06b6d4' },
  { value: 'emerald', label: 'Smeraldo', swatch: '#10b981' },
  { value: 'rose', label: 'Rosa', swatch: '#f43f5e' },
  { value: 'amber', label: 'Ambra', swatch: '#f59e0b' },
]

export const fonts = [
  { value: 'sans', label: 'Sans-serif', family: 'ui-sans-serif, system-ui, sans-serif' },
  { value: 'serif', label: 'Serif', family: 'Georgia, Cambria, "Times New Roman", serif' },
  { value: 'mono', label: 'Monospazio', family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
]

export const lineHeights = [
  { value: 'compact', label: 'Compatta', size: 1.5 },
  { value: 'normal', label: 'Normale', size: 1.75 },
  { value: 'relaxed', label: 'Ampia', size: 2 },
]

export const widths = [
  { value: 'narrow', label: 'Stretta', size: '40rem' },
  { value: 'medium', label: 'Media', size: '56rem' },
  { value: 'full', label: 'Piena', size: '100%' },
]

export const fontSizeRange = { min: 14, max: 24 }

export const defaultAppearance = { theme: 'system', accent: 'violet', font: 'sans', fontSize: 17, lineHeight: 'normal', width: 'medium' }

const pick = (options, value, fallback) => (options.some((option) => option.value === value) ? value : fallback)

function normalize(value = {}) {
  const size = Number(value.fontSize)
  return {
    theme: pick(themes, value.theme, defaultAppearance.theme),
    accent: pick(accents, value.accent, defaultAppearance.accent),
    font: pick(fonts, value.font, defaultAppearance.font),
    fontSize: Number.isFinite(size) ? Math.min(fontSizeRange.max, Math.max(fontSizeRange.min, Math.round(size))) : defaultAppearance.fontSize,
    lineHeight: pick(lineHeights, value.lineHeight, defaultAppearance.lineHeight),
    width: pick(widths, value.width, defaultAppearance.width),
  }
}

export function loadAppearance() {
  try { return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY))) } catch { return { ...defaultAppearance } }
}

export function saveAppearance(appearance) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance)) } catch {}
}

const systemQuery = window.matchMedia('(prefers-color-scheme: dark)')

// Scrive le impostazioni come attributi e variabili CSS sulla radice del documento.
export function applyAppearance(appearance) {
  const root = document.documentElement
  const theme = appearance.theme === 'system' ? (systemQuery.matches ? 'dark' : 'light') : appearance.theme
  root.dataset.theme = theme
  root.dataset.accent = appearance.accent
  root.style.setProperty('--editor-font', fonts.find((font) => font.value === appearance.font).family)
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
