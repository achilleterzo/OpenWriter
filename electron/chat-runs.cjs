const path = require('node:path')

const ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/
const MAX_LIVE_CHARS = 400000
const text = (value) => (typeof value === 'string' ? value.slice(-MAX_LIVE_CHARS) : '')

// La stessa conversazione è la stessa anche con un'altra grafia del percorso del progetto (su Windows le maiuscole non contano).
const storeKey = (project) => (project ? (process.platform === 'win32' ? path.resolve(project).toLowerCase() : path.resolve(project)) : '__main__')

/**
 * Chi sta lavorando a una conversazione, e cosa si vede mentre lo fa: il registro dei «run» del nucleo (vedi docs/design/core-and-windows.md, passo 4).
 *
 * Il ciclo dell'assistente (le chiamate al modello, gli strumenti che toccano l'editor, la coda) gira nella finestra che ha avviato il lavoro, perché gli
 * strumenti agiscono sui documenti aperti in quella finestra. Il nucleo non lo sostituisce: tiene lo stato condiviso e lo distribuisce.
 *   · il pilota (la finestra che lavora) annuncia l'inizio, manda il testo che arriva (`live`) e annuncia la fine;
 *   · le altre finestre sullo stesso progetto lo ricevono: vedono la conversazione al lavoro, con lo stesso testo, e possono fermarla o mettere in coda;
 *   · chi apre una finestra a lavoro già iniziato chiede un'istantanea (`list`) e poi segue gli eventi;
 *   · se la finestra pilota si chiude o cade, il run finisce «interrotto» per tutti.
 * Le modifiche salvate della conversazione (messaggi, coda, titolo) arrivano con `changed`: chi non l'ha fatta le rilegge.
 *
 * Eventi (canali): `chat:run-state` { conversationId, running, interrupted? }, `chat:run-live` { conversationId, live }, `chat:changed` { conversationId, kind, queue? },
 * e `chat:run-cancel` { conversationId } alla sola finestra pilota.
 */
function createChatRuns({ events }) {
  const runs = new Map() // chiave → { project, conversationId, driver, live }
  const keyOf = (project, conversationId) => `${storeKey(project)}|${conversationId}`
  const valid = (conversationId) => typeof conversationId === 'string' && ID_PATTERN.test(conversationId)

  function finish(run, interrupted) {
    runs.delete(keyOf(run.project, run.conversationId))
    events.toStore(run.project, { except: run.driver }, 'chat:run-state', { conversationId: run.conversationId, running: false, ...(interrupted ? { interrupted: true } : {}) })
  }

  return {
    // → false se un'altra finestra sta già lavorando a quella conversazione (resta quella a guidare).
    start({ sender, project, conversationId }) {
      if (!valid(conversationId) || !sender) return false
      const key = keyOf(project, conversationId)
      const existing = runs.get(key)
      if (existing && existing.driver !== sender) return false
      if (existing) return true
      const run = { project, conversationId, driver: sender, live: null }
      runs.set(key, run)
      // La pagina pilota sparisce (finestra chiusa, processo caduto): il lavoro è interrotto per tutti.
      sender.once?.('destroyed', () => { if (runs.get(key) === run) finish(run, true) })
      events.toStore(project, { except: sender }, 'chat:run-state', { conversationId, running: true })
      return true
    },

    live({ sender, project, conversationId, live }) {
      const run = runs.get(keyOf(project, conversationId))
      if (!run || run.driver !== sender) return false
      run.live = { text: text(live?.text), thinking: text(live?.thinking), status: text(live?.status) }
      events.toStore(project, { except: sender }, 'chat:run-live', { conversationId, live: run.live })
      return true
    },

    end({ sender, project, conversationId }) {
      const run = runs.get(keyOf(project, conversationId))
      if (!run || run.driver !== sender) return false
      finish(run, false)
      return true
    },

    // Le conversazioni al lavoro in quel progetto, con il testo arrivato finora.
    list(project) {
      return [...runs.values()].filter((run) => storeKey(run.project) === storeKey(project)).map((run) => ({ conversationId: run.conversationId, running: true, live: run.live }))
    },

    // Chiede alla finestra pilota di fermarsi. → false se nessuno sta lavorando.
    cancel({ project, conversationId }) {
      const run = runs.get(keyOf(project, conversationId))
      if (!run) return false
      return events.toContents(run.driver, 'chat:run-cancel', { conversationId }) > 0
    },

    // La conversazione è cambiata su disco (`kind`: 'content', 'queue', 'deleted'): le altre finestre dello stesso progetto la rileggono.
    changed({ sender, project, conversationId, kind, queue }) {
      if (!valid(conversationId)) return 0
      return events.toStore(project, { except: sender }, 'chat:changed', { conversationId, kind, ...(kind === 'queue' ? { queue } : {}) })
    },

    active: () => runs.size,
  }
}

module.exports = { createChatRuns, storeKey }
