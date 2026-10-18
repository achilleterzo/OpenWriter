// Preferenze dell'interfaccia (tema, lingua, larghezza dei pannelli, vista delle note…).
// Stanno nei dati dell'app (un file gestito dal processo principale), non solo nel localStorage del browser: quello dipende dall'indirizzo
// da cui si carica la pagina (sviluppo, app installata, altra porta) e dalla cartella di installazione, quindi cambiando uno di questi si perdeva tutto.
// Il localStorage resta come ripiego (e per chi apre la pagina in un browser) e come fonte da cui migrare i valori delle versioni precedenti.
const bridge = typeof window !== 'undefined' ? window.electronAPI?.preferences : null
const cache = { ...(bridge?.values || {}) }

// Valore salvato (stringa) o null.
export function getPreference(key) {
  if (key in cache) return cache[key]
  try {
    const legacy = localStorage.getItem(key)
    if (legacy !== null) {
      // Primo avvio dopo l'aggiornamento: il valore del localStorage passa nei dati dell'app.
      cache[key] = legacy
      bridge?.set(key, legacy)
      return legacy
    }
  } catch { /* localStorage non disponibile */ }
  return null
}

export function setPreference(key, value) {
  const text = String(value)
  cache[key] = text
  bridge?.set(key, text)
  try { localStorage.setItem(key, text) } catch { /* senza storage vale solo per questa sessione */ }
}
