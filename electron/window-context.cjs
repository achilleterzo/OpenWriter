const { createProjectFile } = require('./project-file.cjs')
const { createChatStore } = require('./chat-store.cjs')
const { createMemoryStore } = require('./memory-store.cjs')
const { createNotesStore } = require('./notes-store.cjs')
const { createBookmarksStore } = require('./bookmarks-store.cjs')
const { createBrowserHistory } = require('./browser-history.cjs')
const { createLinksStore } = require('./project-links.cjs')
const { createReferencesStore } = require('./project-references.cjs')
const { createWebReferencesStore } = require('./web-references.cjs')
const { createProjectTools } = require('./project-tools.cjs')

/**
 * Tutto ciò che dipende dal progetto aperto in una finestra: il progetto e gli archivi che vivono dentro di lui (chat, memoria, note, segnalibri, cronologia,
 * collegamenti, riferimenti, strumenti dell'assistente). Prima erano variabili e costanti del processo (`projectPath` e gli archivi costruiti su di essa);
 * ora stanno in un oggetto, così per ogni finestra se ne crea uno e nessuno condivide per caso il progetto di un'altra (vedi docs/design/core-and-windows.md).
 * Gli archivi leggono il progetto a ogni chiamata (`project`): cambiarlo con `context.project = …` vale per tutti, subito.
 * Quello che non dipende da una finestra (progetti, spazi di lavoro, impostazioni, indice) resta nel processo.
 *
 *   mainDirectory()  la cartella del progetto «main»: fa da progetto quando nessuno è aperto
 *   readDocument(filePath)  lettura dei documenti per gli strumenti dell'assistente
 */
function createWindowContext({ mainDirectory, readDocument }) {
  let project = null
  // Senza progetto aperto gli archivi usano quello «main».
  const storePath = () => project || mainDirectory()

  const browserHistory = createBrowserHistory({ getProjectPath: storePath })
  // Quella delle pagine visitate dall'assistente: a parte, non si mischia con la cronologia dell'utente.
  const agentBrowserHistory = createBrowserHistory({ getProjectPath: storePath, fileName: 'browser-history-agent.json' })

  return {
    get project() { return project },
    set project(value) { project = value },
    // Lo stato di questa finestra che non è un archivio: cosa mostra e cosa sorveglia. Era fatto di variabili del processo (vedi docs/design/core-and-windows.md).
    first: false, // la prima finestra del processo: solo lei ripristina la sessione dopo un avvio interrotto e azzera i membri temporanei
    slot: 0, // 0 per la prima finestra su un progetto, 1… per le altre: la sessione (schede aperte) è per finestra
    knowledgeOn: true, // l'indice di ricerca è acceso per il progetto di questa finestra
    referenceWatchers: [],
    workspaceWatcher: null,
    workspaceWatchTimer: null,
    annotationsWatchTimer: null,
    changedPaths: new Set(),
    viewMode: 'endless',
    homeOpen: false,
    storePath,
    projectFile: createProjectFile({ getProjectPath: storePath, getMainPath: mainDirectory }),
    chatStore: createChatStore({ getProjectPath: storePath }),
    memoryStore: createMemoryStore({ getProjectPath: storePath }),
    browserHistory,
    agentBrowserHistory,
    historyFor: (agent) => (agent ? agentBrowserHistory : browserHistory),
    notesStore: createNotesStore({ getProjectPath: storePath, getMainPath: mainDirectory }),
    bookmarksStore: createBookmarksStore({ getProjectPath: storePath, getMainPath: mainDirectory }),
    // Documenti esterni collegati al progetto aperto (senza copiarli).
    linksStore: createLinksStore({ getProjectPath: () => project }),
    // Cartelle di riferimento (fuori dal progetto, solo lettura per l'assistente).
    referencesStore: createReferencesStore({ getProjectPath: () => project }),
    webStore: createWebReferencesStore({ getProjectPath: () => project }),
    projectTools: createProjectTools({ getProjectPath: () => project, readDocument }),
  }
}

module.exports = { createWindowContext }
