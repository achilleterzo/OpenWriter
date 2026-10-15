// Caratteri dell'editor: un set ristretto di Google Fonts incluso nell'app (caricato solo quando serve) e quelli installati dal catalogo Google Fonts.
// Solo estetico: il carattere non entra nel documento né negli export.

// category: 'sans' | 'serif' | 'mono', serve da ripiego se il carattere non si carica.
export const curatedFonts = [
  { family: 'Inter', category: 'sans', load: () => Promise.all([
    import('@fontsource/inter/latin-400.css'),
    import('@fontsource/inter/latin-400-italic.css'),
    import('@fontsource/inter/latin-700.css'),
    import('@fontsource/inter/latin-700-italic.css'),
    import('@fontsource/inter/latin-ext-400.css'),
    import('@fontsource/inter/latin-ext-400-italic.css'),
    import('@fontsource/inter/latin-ext-700.css'),
    import('@fontsource/inter/latin-ext-700-italic.css'),
  ]) },
  { family: 'Source Sans 3', category: 'sans', load: () => Promise.all([
    import('@fontsource/source-sans-3/latin-400.css'),
    import('@fontsource/source-sans-3/latin-400-italic.css'),
    import('@fontsource/source-sans-3/latin-700.css'),
    import('@fontsource/source-sans-3/latin-700-italic.css'),
    import('@fontsource/source-sans-3/latin-ext-400.css'),
    import('@fontsource/source-sans-3/latin-ext-400-italic.css'),
    import('@fontsource/source-sans-3/latin-ext-700.css'),
    import('@fontsource/source-sans-3/latin-ext-700-italic.css'),
  ]) },
  { family: 'Lora', category: 'serif', load: () => Promise.all([
    import('@fontsource/lora/latin-400.css'),
    import('@fontsource/lora/latin-400-italic.css'),
    import('@fontsource/lora/latin-700.css'),
    import('@fontsource/lora/latin-700-italic.css'),
    import('@fontsource/lora/latin-ext-400.css'),
    import('@fontsource/lora/latin-ext-400-italic.css'),
    import('@fontsource/lora/latin-ext-700.css'),
    import('@fontsource/lora/latin-ext-700-italic.css'),
  ]) },
  { family: 'Merriweather', category: 'serif', load: () => Promise.all([
    import('@fontsource/merriweather/latin-400.css'),
    import('@fontsource/merriweather/latin-400-italic.css'),
    import('@fontsource/merriweather/latin-700.css'),
    import('@fontsource/merriweather/latin-700-italic.css'),
    import('@fontsource/merriweather/latin-ext-400.css'),
    import('@fontsource/merriweather/latin-ext-400-italic.css'),
    import('@fontsource/merriweather/latin-ext-700.css'),
    import('@fontsource/merriweather/latin-ext-700-italic.css'),
  ]) },
  { family: 'EB Garamond', category: 'serif', load: () => Promise.all([
    import('@fontsource/eb-garamond/latin-400.css'),
    import('@fontsource/eb-garamond/latin-400-italic.css'),
    import('@fontsource/eb-garamond/latin-700.css'),
    import('@fontsource/eb-garamond/latin-700-italic.css'),
    import('@fontsource/eb-garamond/latin-ext-400.css'),
    import('@fontsource/eb-garamond/latin-ext-400-italic.css'),
    import('@fontsource/eb-garamond/latin-ext-700.css'),
    import('@fontsource/eb-garamond/latin-ext-700-italic.css'),
  ]) },
  { family: 'Source Serif 4', category: 'serif', load: () => Promise.all([
    import('@fontsource/source-serif-4/latin-400.css'),
    import('@fontsource/source-serif-4/latin-400-italic.css'),
    import('@fontsource/source-serif-4/latin-700.css'),
    import('@fontsource/source-serif-4/latin-700-italic.css'),
    import('@fontsource/source-serif-4/latin-ext-400.css'),
    import('@fontsource/source-serif-4/latin-ext-400-italic.css'),
    import('@fontsource/source-serif-4/latin-ext-700.css'),
    import('@fontsource/source-serif-4/latin-ext-700-italic.css'),
  ]) },
  { family: 'JetBrains Mono', category: 'mono', load: () => Promise.all([
    import('@fontsource/jetbrains-mono/latin-400.css'),
    import('@fontsource/jetbrains-mono/latin-400-italic.css'),
    import('@fontsource/jetbrains-mono/latin-700.css'),
    import('@fontsource/jetbrains-mono/latin-700-italic.css'),
    import('@fontsource/jetbrains-mono/latin-ext-400.css'),
    import('@fontsource/jetbrains-mono/latin-ext-400-italic.css'),
    import('@fontsource/jetbrains-mono/latin-ext-700.css'),
    import('@fontsource/jetbrains-mono/latin-ext-700-italic.css'),
  ]) },
  { family: 'IBM Plex Mono', category: 'mono', load: () => Promise.all([
    import('@fontsource/ibm-plex-mono/latin-400.css'),
    import('@fontsource/ibm-plex-mono/latin-400-italic.css'),
    import('@fontsource/ibm-plex-mono/latin-700.css'),
    import('@fontsource/ibm-plex-mono/latin-700-italic.css'),
    import('@fontsource/ibm-plex-mono/latin-ext-400.css'),
    import('@fontsource/ibm-plex-mono/latin-ext-400-italic.css'),
    import('@fontsource/ibm-plex-mono/latin-ext-700.css'),
    import('@fontsource/ibm-plex-mono/latin-ext-700-italic.css'),
  ]) },
]

const bridge = window.electronAPI?.fonts
const loaded = new Map()
let installed = []
const listeners = new Set()

const notify = () => listeners.forEach((listener) => listener(installed))

// Rende disponibile un carattere incluso nell'app (idempotente). Quelli installati sono già nella pagina.
export function loadFamily(family) {
  const curated = curatedFonts.find((font) => font.family === family)
  if (!curated) return Promise.resolve()
  if (!loaded.has(family)) loaded.set(family, curated.load().catch(() => loaded.delete(family)))
  return loaded.get(family)
}

export const getInstalledFonts = () => installed

export function subscribeFonts(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function inject(font) {
  let style = Array.from(document.head.querySelectorAll('style[data-installed-font]')).find((item) => item.dataset.installedFont === font.family)
  if (!style) {
    style = document.createElement('style')
    style.dataset.installedFont = font.family
    document.head.appendChild(style)
  }
  style.textContent = font.css
}

export async function refreshInstalledFonts() {
  if (!bridge) return
  try {
    installed = await bridge.list()
    installed.forEach(inject)
    notify()
  } catch { /* nessun carattere installato */ }
}

export async function installFont(family) {
  const font = await bridge.install(family)
  inject(font)
  installed = [...installed.filter((item) => item.family !== font.family), font].sort((left, right) => left.family.localeCompare(right.family))
  notify()
}

export async function removeFont(family) {
  await bridge.remove(family)
  document.head.querySelectorAll('style[data-installed-font]').forEach((style) => { if (style.dataset.installedFont === family) style.remove() })
  installed = installed.filter((item) => item.family !== family)
  notify()
}

export const fetchCatalog = () => bridge.catalog()

refreshInstalledFonts()
