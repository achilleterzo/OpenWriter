/**
 * Cache dei sinonimi chiesti al modello linguistico per la ricerca della Home: la stessa parola, con lo stesso modello, non si chiede due volte (costa una chiamata
 * all'IA). Si ricorda tra una sessione e l'altra (nelle preferenze dell'app), per un tempo limitato e in numero limitato: chi non si usa da tempo sparisce.
 *
 * `read()` dà il testo salvato (o null), `write(text)` lo salva; `now()` serve alle prove. Una risposta vuota non si ricorda: potrebbe essere stato un guasto.
 */
const VERSION = 1
export const DEFAULT_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const DEFAULT_MAX_ENTRIES = 300

const fold = (value) => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()

// La chiave: il modello (cambiarlo dà altri sinonimi) e la domanda senza maiuscole, accenti e spazi doppi.
export const synonymKey = (query, modelId) => `${modelId || 'default'}|${fold(query)}`

export function createSynonymCache({ read, write, now = Date.now, ttlMs = DEFAULT_TTL_MS, max = DEFAULT_MAX_ENTRIES }) {
  function load() {
    try {
      const parsed = JSON.parse(read() || 'null')
      if (parsed?.version === VERSION && parsed.items && typeof parsed.items === 'object') return parsed.items
    } catch { /* cache illeggibile: si riparte vuota */ }
    return {}
  }

  function save(items) {
    try { write(JSON.stringify({ version: VERSION, items })) } catch { /* senza salvataggio vale solo per ora */ }
  }

  const alive = (entry) => entry && Array.isArray(entry.terms) && entry.terms.length > 0 && now() - entry.at < ttlMs

  return {
    // I sinonimi ricordati, o null. Un uso li tiene "freschi" (si scartano prima quelli non usati da più tempo).
    get(key) {
      const items = load()
      const entry = items[key]
      if (!alive(entry)) {
        if (entry) { delete items[key]; save(items) }
        return null
      }
      entry.used = now()
      save(items)
      return [...entry.terms]
    },
    set(key, terms) {
      if (!Array.isArray(terms) || !terms.length) return
      const items = load()
      items[key] = { terms: terms.map(String), at: now(), used: now() }
      for (const [other, entry] of Object.entries(items)) if (!alive(entry)) delete items[other]
      const overflow = Object.keys(items).length - max
      if (overflow > 0) {
        Object.entries(items).sort((a, b) => (a[1].used ?? a[1].at) - (b[1].used ?? b[1].at)).slice(0, overflow).forEach(([other]) => delete items[other])
      }
      save(items)
    },
    clear() { save({}) },
    get size() { return Object.keys(load()).length },
  }
}
