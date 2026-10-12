import it from './locales/it.json'
import es from './locales/es.json'
import fr from './locales/fr.json'
import de from './locales/de.json'
import pt from './locales/pt.json'

/**
 * Localizzazione dell'interfaccia. Le chiavi sono i testi in inglese (lingua di partenza e di ripiego):
 *   t('Save')                       → 'Salva' in italiano
 *   t('{count} copied', { count })  → segnaposto con {nome}
 *   tp(n, { one: '{count} image', other: '{count} images' }, { count: n }) → plurali
 * Una chiave senza traduzione mostra il testo inglese. I cataloghi sono JSON condivisi con il processo principale.
 */
export const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'it', name: 'Italiano' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'pt', name: 'Português' },
]

const catalogs = { it, es, fr, de, pt }
const STORAGE_KEY = 'openwriter.language'
const DEFAULT_LANGUAGE = 'en'
// "pseudo" è solo per le verifiche: racchiude ogni testo tradotto tra ⟦ ⟧ per scovare quelli non ancora passati da t().
const SPECIAL = new Set(['auto', 'pseudo'])

const supported = (code) => LANGUAGES.some((language) => language.code === code)

// Lingua effettiva a partire dalla preferenza ("auto" = quella del sistema, se supportata).
function resolve(preference) {
  if (preference === 'pseudo') return 'pseudo'
  if (preference === 'auto') {
    const system = String(typeof navigator !== 'undefined' ? navigator.language : '').slice(0, 2).toLowerCase()
    return supported(system) ? system : DEFAULT_LANGUAGE
  }
  return supported(preference) ? preference : DEFAULT_LANGUAGE
}

function loadPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return SPECIAL.has(saved) || supported(saved) ? saved : DEFAULT_LANGUAGE
  } catch {
    return DEFAULT_LANGUAGE
  }
}

let preference = loadPreference()
let current = resolve(preference)
const listeners = new Set()

const interpolate = (text, params) => (params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text)
const decorate = (text) => (current === 'pseudo' ? `⟦${text}⟧` : text)
// Una chiave può avere un contesto dopo "|" per distinguere significati (es. "Medium|width"): non si mostra mai.
const plain = (text) => text.replace(/\|\w+$/, '')

export function t(key, params) {
  const translated = current === DEFAULT_LANGUAGE || current === 'pseudo' ? key : catalogs[current]?.[key]
  return decorate(interpolate(plain(typeof translated === 'string' ? translated : key), params))
}

// Plurali: `forms` ha le forme inglesi { one, other }; nei cataloghi la voce è indicizzata dalla forma "other".
export function tp(count, forms, params) {
  const entry = current === DEFAULT_LANGUAGE || current === 'pseudo' ? forms : catalogs[current]?.[forms.other]
  const table = entry && typeof entry === 'object' ? entry : forms
  const category = new Intl.PluralRules(current === 'pseudo' ? DEFAULT_LANGUAGE : current).select(count)
  return decorate(interpolate(table[category] ?? table.other ?? forms.other, { count, ...params }))
}

export const getLanguage = () => current

// Nome inglese della lingua dell'interfaccia: è quello che si scrive nei prompt ("Reply in Italian").
const ENGLISH_NAMES = { en: 'English', it: 'Italian', es: 'Spanish', fr: 'French', de: 'German', pt: 'Portuguese' }
export const languageEnglishName = () => ENGLISH_NAMES[current] || ENGLISH_NAMES[DEFAULT_LANGUAGE]

// Dopo un cambio di lingua la finestra si ricarica (la sessione, le bozze e le schede vengono ripristinate):
// così tutti i testi, anche quelli definiti all'avvio, passano alla nuova lingua. Il flag riapre le impostazioni.
export const AFTER_LANGUAGE_RELOAD_KEY = 'openwriter.afterLanguageReload'
export const getLanguagePreference = () => preference

function announce() {
  document.documentElement.lang = current === 'pseudo' ? DEFAULT_LANGUAGE : current
  // Il processo principale usa la stessa lingua per menu, finestre di dialogo ed errori.
  window.electronAPI?.setLocale?.(current === 'pseudo' ? DEFAULT_LANGUAGE : current)
  listeners.forEach((listener) => listener())
}

export function setLanguage(next) {
  const before = current
  preference = SPECIAL.has(next) || supported(next) ? next : DEFAULT_LANGUAGE
  current = resolve(preference)
  try { localStorage.setItem(STORAGE_KEY, preference) } catch { /* senza storage vale solo per questa sessione */ }
  announce()
  if (current !== before) {
    try { sessionStorage.setItem(AFTER_LANGUAGE_RELOAD_KEY, 'settings') } catch { /* si ricarica comunque */ }
    window.location.reload()
  }
}

export function subscribeLanguage(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Da chiamare all'avvio: allinea lang del documento e processo principale alla lingua salvata.
export function initLanguage() {
  announce()
}

// Formati di data/numero secondo la lingua dell'interfaccia.
export const intlLocale = () => (current === 'pseudo' ? DEFAULT_LANGUAGE : current)
export const formatDateTime = (value, options) => new Intl.DateTimeFormat(intlLocale(), options).format(new Date(value))
export const formatNumber = (value) => new Intl.NumberFormat(intlLocale()).format(value)
export const languageName = (code) => {
  try { return new Intl.DisplayNames([intlLocale()], { type: 'language' }).of(code) } catch { return code }
}
