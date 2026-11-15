const path = require('node:path')

const MAX_PATHS = 500

// Lo stesso file con un'altra grafia del percorso (su Windows le maiuscole non contano) è lo stesso documento.
const keyOf = (filePath) => (process.platform === 'win32' ? path.resolve(filePath).toLowerCase() : path.resolve(filePath))

/**
 * Quale finestra sta modificando quale documento: un documento si modifica in una finestra alla volta (vedi docs/design/core-and-windows.md, passo 6).
 * Le altre finestre che lo hanno aperto lo vedono in sola lettura e si aggiornano ai salvataggi; quando chi lo teneva lo lascia (chiude la scheda o la finestra)
 * lo sanno, e una di loro lo prende.
 *
 * Ogni finestra dichiara l'insieme dei documenti che vuole tenere (`setHeld`), non le singole aperture e chiusure: la differenza con quello di prima è
 * il rilascio, e un messaggio perso non lascia un documento bloccato. Un documento ha un solo proprietario; chi non lo ottiene è «rifiutato».
 *   · `documents:released` { path } alle altre finestre quando un documento si libera;
 *   · `documents:reveal` { path } alla finestra proprietaria, quando un'altra chiede di portarla avanti.
 */
function createDocumentOwners({ events }) {
  const owners = new Map() // chiave → { path, owner (la pagina) }
  const watching = new WeakSet()

  function release(sender, keep = new Set()) {
    const freed = []
    for (const [key, entry] of owners) {
      if (entry.owner === sender && !keep.has(key)) { owners.delete(key); freed.push(entry.path) }
    }
    for (const freedPath of freed) events.toOthers(sender, 'documents:released', { path: freedPath })
    return freed
  }

  return {
    // → { refused: [percorsi] }: quelli che un'altra finestra sta già modificando.
    setHeld({ sender, paths }) {
      if (!sender) return { refused: [] }
      const wanted = new Map()
      for (const value of (Array.isArray(paths) ? paths : []).slice(0, MAX_PATHS)) {
        if (typeof value === 'string' && value) wanted.set(keyOf(value), value)
      }
      release(sender, new Set(wanted.keys()))
      const refused = []
      for (const [key, value] of wanted) {
        const current = owners.get(key)
        if (!current) owners.set(key, { path: value, owner: sender })
        else if (current.owner !== sender) refused.push(value)
      }
      // La pagina sparisce (finestra chiusa, processo caduto): i suoi documenti si liberano.
      if (!watching.has(sender)) { watching.add(sender); sender.once?.('destroyed', () => release(sender)) }
      return { refused }
    },

    // Porta avanti la finestra che sta modificando quel documento (la pagina riceve `documents:reveal` per mostrare la scheda). → false se nessuno lo tiene.
    focusOwner(filePath) {
      const entry = typeof filePath === 'string' && filePath ? owners.get(keyOf(filePath)) : null
      if (!entry) return false
      const window = events.windowFor(entry.owner)?.window
      if (window) {
        if (window.isMinimized?.()) window.restore()
        window.show?.()
        window.focus?.()
      }
      events.toContents(entry.owner, 'documents:reveal', { path: entry.path })
      return true
    },

    // Chi lo tiene adesso (la pagina), o null.
    ownerOf: (filePath) => owners.get(keyOf(filePath))?.owner || null,
    count: () => owners.size,
  }
}

module.exports = { createDocumentOwners }
