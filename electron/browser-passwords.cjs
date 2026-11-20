/**
 * Password dei siti del browser interno. Si salvano cifrate (safeStorage del sistema) in un file dei dati dell'app, mai nel progetto, legate all'origine
 * del sito (`https://sito.it`). La password non arriva mai all'interfaccia: la tiene questo modulo, che la compila nella pagina quando l'utente lo chiede.
 *
 * Il file `browser-passwords.json`: { entries: [{ id, origin, username, secret, updatedAt }], never: [origin] }.
 * `never` sono i siti per cui l'utente ha scelto «Mai»: non si propone più di salvare.
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { writeFileAtomic } = require('./atomic-write.cjs')

const FILE_NAME = 'browser-passwords.json'
const MAX_USERNAME = 200
const MAX_PASSWORD = 500
const MAX_ENTRIES = 2000

/** L'origine di un indirizzo, se è un sito su cui ha senso salvare password (https, o http solo sul computer stesso); altrimenti ''. */
function originOf(address) {
  try {
    const url = new URL(String(address))
    if (url.protocol === 'https:') return url.origin
    if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return url.origin
  } catch { /* indirizzo non valido */ }
  return ''
}

function createPasswordStore({ directory, secrets }) {
  const file = path.join(directory, FILE_NAME)

  function read() {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'))
      return {
        entries: Array.isArray(data.entries) ? data.entries.filter((entry) => entry && typeof entry.id === 'string' && typeof entry.origin === 'string' && typeof entry.secret === 'string') : [],
        never: Array.isArray(data.never) ? data.never.filter((origin) => typeof origin === 'string') : [],
      }
    } catch { return { entries: [], never: [] } }
  }
  function write(data) {
    fs.mkdirSync(directory, { recursive: true })
    writeFileAtomic(file, JSON.stringify(data, null, 2), { mode: 0o600 })
  }
  const plain = (entry) => ({ id: entry.id, origin: entry.origin, username: entry.username || '', updatedAt: entry.updatedAt || 0 })
  const decrypt = (entry) => { try { return secrets.decrypt(entry.secret) } catch { return null } }

  return {
    /** Senza cifratura del sistema non si salva nulla (mai in chiaro). */
    available: () => secrets.available(),

    list() { return read().entries.map(plain).sort((a, b) => a.origin.localeCompare(b.origin) || a.username.localeCompare(b.username)) },
    listFor(origin) { return read().entries.filter((entry) => entry.origin === origin).map(plain).sort((a, b) => b.updatedAt - a.updatedAt) },

    /** La password di un sito e di un utente, se c'è (uso interno, per confrontare con quella appena scritta). */
    find(origin, username) {
      const entry = read().entries.find((item) => item.origin === origin && (item.username || '') === (username || ''))
      return entry ? { id: entry.id, password: decrypt(entry) } : null
    },
    /** Una voce con la password in chiaro: solo per compilare la pagina. */
    get(id) {
      const entry = read().entries.find((item) => item.id === id)
      if (!entry) return null
      const password = decrypt(entry)
      return password === null ? null : { id: entry.id, origin: entry.origin, username: entry.username || '', password }
    },

    /** Salva (o aggiorna, per lo stesso sito e utente). → id. */
    save({ origin, username = '', password }) {
      if (!secrets.available()) throw new Error('Encryption is not available on this computer')
      if (!originOf(origin) || originOf(origin) !== origin) throw new Error('Invalid site')
      const user = String(username || '').slice(0, MAX_USERNAME)
      const secret = String(password || '')
      if (!secret || secret.length > MAX_PASSWORD) throw new Error('Invalid password')
      const data = read()
      const existing = data.entries.find((entry) => entry.origin === origin && (entry.username || '') === user)
      const encrypted = secrets.encrypt(secret)
      if (existing) {
        existing.secret = encrypted
        existing.updatedAt = Date.now()
        write(data)
        return existing.id
      }
      if (data.entries.length >= MAX_ENTRIES) throw new Error('Too many saved passwords')
      const id = crypto.randomUUID()
      data.entries.push({ id, origin, username: user, secret: encrypted, updatedAt: Date.now() })
      data.never = data.never.filter((item) => item !== origin)
      write(data)
      return id
    },

    remove(id) {
      const data = read()
      data.entries = data.entries.filter((entry) => entry.id !== id)
      write(data)
    },
    clear() { const data = read(); data.entries = []; write(data) },

    isNever: (origin) => read().never.includes(origin),
    neverList: () => read().never.slice().sort(),
    addNever(origin) {
      if (!originOf(origin) || originOf(origin) !== origin) return
      const data = read()
      if (!data.never.includes(origin)) { data.never.push(origin); write(data) }
    },
    removeNever(origin) { const data = read(); data.never = data.never.filter((item) => item !== origin); write(data) },
  }
}

/**
 * Lo script che gira nella pagina, in un mondo JavaScript separato da quello dei suoi script (la pagina non lo vede né lo può chiamare).
 * Comunica scrivendo sulla console una riga che comincia con `MARKER`: `{ kind: 'password', origin, username, password }` quando c'è una password da proporre,
 * `{ kind: 'user', origin, username }` per il nome utente scritto in un passo precedente (accessi a più passi).
 * La password si segnala quando: si invia un modulo, si preme Invio in un campo, si clicca un pulsante o un link (tranne «mostra password»), il campo sparisce
 * o viene nascosto (il passo successivo di un accesso a scorrimento), la pagina viene lasciata, o un campo fuori da un modulo perde il focus.
 */
const MARKER = '__OPENWRITER_PASSWORD__'
const CAPTURE_SCRIPT = `(() => {
  if (window.__openwriterPasswords) return
  window.__openwriterPasswords = true
  const marker = ${JSON.stringify(MARKER)}
  const visible = (element) => Boolean(element.isConnected && (element.offsetParent || element.getClientRects().length))
  const textual = (input) => /^(text|email|tel|)$/i.test(input.type)
  const looksLikeUser = (input) => textual(input) && (input.type === 'email' || /user|login|email|mail|account|utente|nome/i.test([input.autocomplete, input.name, input.id].join(' ')))
  const send = (data) => console.log(marker + JSON.stringify({ origin: location.origin, ...data }))
  let rememberedUser = ''
  let lastKey = ''
  let lastAt = 0
  let pending = null
  function userBefore(password, scope) {
    const inputs = [...(password.form || scope || document).querySelectorAll('input')]
    const before = inputs.slice(0, inputs.indexOf(password)).reverse().find((input) => textual(input) && input.value && visible(input))
    return before ? before.value : rememberedUser
  }
  function reportPassword(password, scope) {
    if (!password || !password.value) return
    const username = userBefore(password, scope)
    const key = username + '\\u0000' + password.value
    if (key === lastKey && Date.now() - lastAt < 3000) return
    lastKey = key
    lastAt = Date.now()
    if (pending === password) pending = null
    send({ kind: 'password', username, password: password.value })
  }
  const firstPassword = (scope) => [...scope.querySelectorAll('input[type=password]')].find((input) => visible(input) && input.value)
  function reportScope(scope) { const password = firstPassword(scope); if (password) reportPassword(password, scope) }
  const flush = () => { if (pending && pending.value) reportPassword(pending, document) }

  document.addEventListener('input', (event) => { const target = event.target; if (target instanceof HTMLInputElement && target.type === 'password') pending = target }, true)
  document.addEventListener('change', (event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement)) return
    if (target.type === 'password') {
      // Un campo fuori da un modulo non ha un invio: quando perde il focus con un valore, lo si propone.
      if (!target.form) setTimeout(() => { if (target.value && visible(target) && document.activeElement !== target) reportPassword(target, document) }, 1500)
    } else if (looksLikeUser(target) && target.value) {
      rememberedUser = target.value
      send({ kind: 'user', username: target.value })
    }
  }, true)
  document.addEventListener('submit', (event) => reportScope(event.target instanceof Element ? event.target : document), true)
  document.addEventListener('click', (event) => {
    const control = event.target instanceof Element ? event.target.closest('a[href], button, input[type=submit], input[type=button], [role=button], [onclick], [tabindex]') : null
    if (!control || (control instanceof HTMLInputElement && /^(text|email|password|tel|search|number)$/i.test(control.type))) return
    const scope = control.closest('form') || document
    const password = firstPassword(scope)
    if (!password) return
    // «Mostra la password»: un pulsante che lo dice nel nome, o nello stesso riquadro del campo.
    const label = [control.getAttribute('aria-label'), control.title, control.textContent].join(' ')
    if (/show|hide|reveal|visib|mostra|nascondi|mostrar|ocultar|afficher|masquer|anzeigen|verbergen|eye|occhio/i.test(label)) return
    if (control.tagName === 'BUTTON' && control.type === 'button' && control.parentElement && control.parentElement.contains(password)) return
    reportPassword(password, scope)
  }, true)
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) reportScope(event.target.form || document)
  }, true)
  window.addEventListener('pagehide', flush)
  // Il campo sparisce o si nasconde (il passo successivo di un accesso a scorrimento): la password digitata si propone.
  let queued = false
  new MutationObserver(() => {
    if (queued) return
    queued = true
    setTimeout(() => { queued = false; if (pending && pending.value && !visible(pending)) flush() }, 300)
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'aria-hidden'] })
})()`

/** Lo script che compila il modulo; → 'ok' (utente e password), 'user' (c'è solo il passo del nome utente: compilato) o 'nofield'. */
function fillScript({ username, password }) {
  return `((data) => {
    const visible = (element) => Boolean(element.offsetParent || element.getClientRects().length)
    const textual = (input) => /^(text|email|tel|)$/i.test(input.type)
    const set = (element, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(element, value)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const target = [...document.querySelectorAll('input[type=password]')].find(visible)
    if (!target) {
      // Accesso a più passi: nel primo c'è solo il nome utente.
      const user = [...document.querySelectorAll('input')].filter((input) => textual(input) && visible(input) && !input.value).find((input) => input.type === 'email' || /user|login|email|mail|account|utente/i.test([input.autocomplete, input.name, input.id].join(' ')))
      if (!user || !data.username) return 'nofield'
      set(user, data.username)
      return 'user'
    }
    const inputs = [...(target.form || document).querySelectorAll('input')].filter(visible)
    const user = inputs.slice(0, inputs.indexOf(target)).reverse().find(textual)
    if (user && data.username) set(user, data.username)
    set(target, data.password)
    return 'ok'
  })(${JSON.stringify({ username, password })})`
}

/** La riga di console di una pagina → { kind, origin, username, password? } se è quella dello script di cattura, altrimenti null. */
function parseCapture(message) {
  const text = String(message || '')
  if (!text.startsWith(MARKER)) return null
  try {
    const data = JSON.parse(text.slice(MARKER.length))
    const username = typeof data.username === 'string' ? data.username.slice(0, MAX_USERNAME) : ''
    const origin = typeof data.origin === 'string' ? data.origin : ''
    if (data.kind === 'user') return username ? { kind: 'user', origin, username } : null
    if (data.kind !== 'password' || typeof data.password !== 'string' || !data.password || data.password.length > MAX_PASSWORD) return null
    return { kind: 'password', origin, username, password: data.password }
  } catch { return null }
}

module.exports = { createPasswordStore, originOf, parseCapture, fillScript, CAPTURE_SCRIPT, MARKER }
