/**
 * Notifiche a comparsa ("toast") a quattro livelli, come un semaforo esteso: info (colore d'accento), success (verde), warning (giallo), error (rosso).
 * Ci arrivano le notifiche esplicite dell'app, gli errori e gli avvisi della console (anche quelli non gestiti) e quelli del processo principale
 * (vedi electron/main.cjs, canale `app:notice`). Una notifica uguale a una appena mostrata non si ripete: aumenta il contatore.
 */
export const LEVELS = ['info', 'success', 'warning', 'error']
const DURATION = { info: 5000, success: 4000, warning: 8000, error: 12000 }
const DEDUPE_MS = 4000
const MAX_VISIBLE = 5

let items = []
let counter = 0
const listeners = new Set()
const timers = new Map()

const emit = () => { for (const listener of listeners) listener(items) }

export function subscribe(listener) {
  listeners.add(listener)
  listener(items)
  return () => listeners.delete(listener)
}

export function dismiss(id) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  items = items.filter((item) => item.id !== id)
  emit()
}

function schedule(id, level) {
  clearTimeout(timers.get(id))
  timers.set(id, setTimeout(() => dismiss(id), DURATION[level]))
}

export function notify(level, message, { detail = '' } = {}) {
  const kind = LEVELS.includes(level) ? level : 'info'
  const text = String(message ?? '').trim()
  if (!text) return
  const now = Date.now()
  const same = items.find((item) => item.level === kind && item.message === text && now - item.at < DEDUPE_MS)
  if (same) {
    items = items.map((item) => (item.id === same.id ? { ...item, count: item.count + 1, at: now } : item))
    schedule(same.id, kind)
    emit()
    return
  }
  counter += 1
  const id = counter
  items = [...items, { id, level: kind, message: text, detail: String(detail || '').trim(), count: 1, at: now }].slice(-MAX_VISIBLE)
  schedule(id, kind)
  emit()
}

// Testo di un argomento della console: un errore mostra il messaggio, un oggetto il suo JSON (se si può).
function describe(value) {
  if (value instanceof Error) return value.message || String(value)
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

// Rumore che non interessa all'utente: avvisi del framework di sviluppo, del browser o già riportati da un'altra via.
const IGNORED = [
  /ResizeObserver loop/i,
  /^Error invoking remote method/, // il processo principale lo notifica da sé (con il motivo)
  /Download the React DevTools/i,
  /^Warning: /, // avvisi di React in sviluppo
  /Autofill\./,
  /Electron Security Warning/i,
]

// Da chiamare una volta all'avvio: errori e avvisi della console, errori della pagina e promesse rifiutate diventano notifiche.
export function installDiagnostics() {
  if (installDiagnostics.done || typeof window === 'undefined') return
  installDiagnostics.done = true
  let busy = false
  const report = (level, parts, error) => {
    if (busy) return
    busy = true
    try {
      const lines = parts.map(describe).join(' ').split('\n').map((line) => line.trim()).filter(Boolean)
      const message = lines[0]?.slice(0, 300)
      if (!message || IGNORED.some((pattern) => pattern.test(message))) return
      const stack = error instanceof Error && error.stack ? error.stack.split('\n').slice(1, 6).join('\n') : lines.slice(1, 7).join('\n')
      notify(level, message, { detail: stack })
    } finally { busy = false }
  }
  for (const [method, level] of [['error', 'error'], ['warn', 'warning']]) {
    const original = console[method].bind(console)
    console[method] = (...args) => { original(...args); report(level, args, args.find((item) => item instanceof Error)) }
  }
  window.addEventListener('error', (event) => report('error', [event.error || event.message], event.error))
  window.addEventListener('unhandledrejection', (event) => report('error', [event.reason instanceof Error ? event.reason.message : `Unhandled promise rejection: ${describe(event.reason)}`], event.reason))
}
