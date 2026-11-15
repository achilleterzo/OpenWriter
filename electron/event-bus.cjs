/**
 * Il solo punto da cui il processo manda eventi alle finestre. Prima ogni invio era `mainWindow.webContents.send(…)`: andava bene con una finestra, ma non dice
 * a chi spetta un evento quando le finestre sono più d'una. Qui ogni invio dichiara a chi è diretto, e il bus sa quali finestre esistono e cosa mostrano
 * (vedi docs/design/core-and-windows.md, passo 2).
 *
 *   register(window, context)   una finestra entra nel bus con il suo contesto (window-context.cjs); esce da sola quando si chiude; restituisce la funzione per toglierla
 *   broadcast(channel, …args)   a tutte le finestre: ciò che non dipende da un progetto (elenco spazi di lavoro, avvisi dell'app)
 *   toProject(project, channel, …args)   alle finestre che mostrano quel progetto: ciò che cambia dentro un progetto (file, note, segnalibri)
 *   toStore(project, { except }, channel, …args)   alle finestre che condividono gli archivi di quel progetto (chat, note…), tranne la pagina che ha fatto la modifica
 *   toOthers(except, channel, …args)   a tutte le finestre tranne quella pagina
 *   toFocused(channel, …args)   alla finestra in primo piano, o alla prima se nessuna lo è: i comandi del menu, le domande, un file aperto da fuori
 *   toContents(webContents, channel, …args)   a quella pagina, di norma chi ha fatto la richiesta (una risposta, un flusso)
 *   toHostOf(contents, channel, …args)   alla finestra che ospita quella pagina incorporata (la scheda del browser)
 *   focused() / windowFor(webContents) / forProject(project) / list() / count()   per chi deve sapere quali finestre ci sono, senza mandare nulla
 *
 * Ogni invio restituisce quante finestre l'hanno ricevuto (0 = nessuna): chi ha bisogno di una risposta (una domanda all'utente) lo controlla.
 */
function createEventBus({ samePath = (a, b) => a === b } = {}) {
  const entries = new Set()
  const sameStore = (a, b) => (!a && !b) || Boolean(a && b && samePath(a, b))

  const live = (entry) => {
    try { return !entry.window.isDestroyed() && !entry.window.webContents.isDestroyed() } catch { return false }
  }
  const alive = () => [...entries].filter(live)

  function deliver(list, channel, args) {
    let sent = 0
    for (const entry of list) {
      try { entry.window.webContents.send(channel, ...args); sent += 1 } catch { /* la finestra si sta chiudendo */ }
    }
    return sent
  }

  function register(window, context) {
    const entry = { window, context }
    entries.add(entry)
    const remove = () => { entries.delete(entry) }
    window.once?.('closed', remove)
    return remove
  }

  const focused = () => {
    const list = alive()
    return list.find((entry) => { try { return entry.window.isFocused() } catch { return false } }) || list[0] || null
  }
  const windowFor = (webContents) => (webContents ? alive().find((entry) => entry.window.webContents === webContents) || null : null)
  const forProject = (project) => (project ? alive().find((entry) => entry.context?.project && samePath(entry.context.project, project)) || null : null)

  return {
    register,
    focused,
    windowFor,
    forProject,
    count: () => alive().length,
    list: alive,
    broadcast: (channel, ...args) => deliver(alive(), channel, args),
    toProject: (project, channel, ...args) => deliver(alive().filter((entry) => entry.context?.project && project && samePath(entry.context.project, project)), channel, args),
    // Alle finestre che condividono gli archivi di quel progetto (senza progetto, quelli del progetto «main»), salvo `except` (la pagina che ha fatto la modifica).
    toStore: (project, { except = null } = {}, channel, ...args) => deliver(alive().filter((entry) => entry.window.webContents !== except && sameStore(entry.context?.project, project)), channel, args),
    // A tutte le finestre tranne una pagina (di solito quella che ha fatto la modifica: lei sa già cosa è cambiato). Senza `except`, a tutte.
    toOthers: (except, channel, ...args) => deliver(alive().filter((entry) => entry.window.webContents !== except), channel, args),
    toFocused(channel, ...args) {
      const entry = focused()
      return entry ? deliver([entry], channel, args) : 0
    },
    toContents(webContents, channel, ...args) {
      try {
        if (!webContents || webContents.isDestroyed()) return 0
        webContents.send(channel, ...args)
        return 1
      } catch { return 0 }
    },
    toHostOf(contents, channel, ...args) {
      const entry = windowFor(contents?.hostWebContents)
      return entry ? deliver([entry], channel, args) : 0
    },
  }
}

module.exports = { createEventBus }
