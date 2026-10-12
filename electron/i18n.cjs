const CODES = ['it', 'es', 'fr', 'de', 'pt']
const catalogs = {}
for (const code of CODES) {
  try { catalogs[code] = require(`../src/i18n/locales/${code}.json`) } catch { catalogs[code] = {} }
}

// Lingua del processo principale (menu, finestre di dialogo, errori): la imposta il renderer ed è ricordata tra gli avvii.
let locale = 'en'

const plain = (text) => text.replace(/\|\w+$/, '')
const interpolate = (text, params) => (params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text)

// Le chiavi sono i testi inglesi, come nel renderer (src/i18n/index.js).
function t(key, params) {
  const translated = locale === 'en' ? key : catalogs[locale]?.[key]
  return interpolate(plain(typeof translated === 'string' ? translated : key), params)
}

function setLocale(code) {
  locale = code === 'en' || CODES.includes(code) ? code : 'en'
  return locale
}

const getLocale = () => locale

module.exports = { t, setLocale, getLocale }
