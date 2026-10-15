const { contextBridge, ipcRenderer, webUtils } = require('electron')

// Preferenze dell'interfaccia lette all'avvio, in modo sincrono: la pagina sa subito tema e lingua (vedi src/lib/preferences.js).
const preferenceValues = ipcRenderer.sendSync('preferences:load') || {}

contextBridge.exposeInMainWorld('electronAPI', {
  preferences: { values: preferenceValues, set: (key, value) => ipcRenderer.send('preferences:set', key, value) },
  setViewMode: (mode) => ipcRenderer.send('view:changed', mode),
  fonts: {
    catalog: () => ipcRenderer.invoke('fonts:catalog'),
    list: () => ipcRenderer.invoke('fonts:list'),
    install: (family) => ipcRenderer.invoke('fonts:install', family),
    remove: (family) => ipcRenderer.invoke('fonts:remove', family),
  },
  openDocument: () => ipcRenderer.invoke('document:open'),
  openDocumentPath: (filePath, options) => ipcRenderer.invoke('document:open-path', filePath, options),
  reopenDocument: (filePath) => ipcRenderer.invoke('document:reopen', filePath),
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (session) => ipcRenderer.invoke('session:save', session),
  saveSessionSync: (session) => ipcRenderer.sendSync('session:save-sync', session),
  startDrag: (paths) => ipcRenderer.send('workspace:start-drag', paths),
  getDroppedPaths: (files) => files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
  importFiles: (request) => ipcRenderer.invoke('workspace:import-files', request),
  getProjectSettings: () => ipcRenderer.invoke('project:get-settings'),
  getContextChain: (filePath) => ipcRenderer.invoke('project:context-chain', filePath),
  moveIntoDirectory: (request) => ipcRenderer.invoke('workspace:move-path', request),
  saveProjectSettings: (settings) => ipcRenderer.invoke('project:save-settings', settings),
  listVersions: (filePath) => ipcRenderer.invoke('history:list', filePath),
  getVersion: (filePath, id) => ipcRenderer.invoke('history:get', { filePath, id }),
  addVersion: (filePath, markdown, label) => ipcRenderer.invoke('history:add', { filePath, markdown, label }),
  deleteVersion: (filePath, id) => ipcRenderer.invoke('history:delete', { filePath, id }),
  editAction: (action) => ipcRenderer.invoke('edit:action', action),
  replaceMisspelling: (text) => ipcRenderer.invoke('edit:replace-misspelling', text),
  addToDictionary: (word) => ipcRenderer.invoke('edit:add-dictionary', word),
  onEditContextMenu: (callback) => {
    const listener = (_event, info) => callback(info)
    ipcRenderer.on('edit:context-menu', listener)
    return () => ipcRenderer.removeListener('edit:context-menu', listener)
  },
  renamePath: (request) => ipcRenderer.invoke('workspace:rename-path', request),
  deletePath: (target) => ipcRenderer.invoke('workspace:delete-path', target),
  openProjectFolder: () => ipcRenderer.invoke('workspace:open-project-folder'),
  createSubproject: (directory) => ipcRenderer.invoke('workspace:create-subproject', directory),
  revealPath: (target) => ipcRenderer.invoke('workspace:reveal-path', target),
  getFileInfo: (target) => ipcRenderer.invoke('workspace:file-info', target),
  getSpellcheck: () => ipcRenderer.invoke('spellcheck:get'),
  setSpellcheckLanguages: (languages) => ipcRenderer.invoke('spellcheck:set-global', languages),
  listConversations: () => ipcRenderer.invoke('chat:list'),
  getConversation: (id) => ipcRenderer.invoke('chat:get', id),
  createConversation: (conversation) => ipcRenderer.invoke('chat:create', conversation),
  saveConversation: (conversation) => ipcRenderer.invoke('chat:save', conversation),
  deleteConversation: (id) => ipcRenderer.invoke('chat:delete', id),
  openChatFolder: () => ipcRenderer.invoke('chat:open-folder'),
  listDirectoryForAi: (path, options) => ipcRenderer.invoke('tools:list-directory', path, options),
  readFileForAi: (request) => ipcRenderer.invoke('tools:read-file', request),
  listNotes: (filePath) => ipcRenderer.invoke('notes:list', filePath),
  listAllNotes: () => ipcRenderer.invoke('notes:list-all'),
  addNote: (request) => ipcRenderer.invoke('notes:add', request),
  updateNote: (request) => ipcRenderer.invoke('notes:update', request),
  deleteNote: (request) => ipcRenderer.invoke('notes:delete', request),
  fetchImage: (url) => ipcRenderer.invoke('images:fetch', url),
  readImageFile: (path) => ipcRenderer.invoke('images:read-file', path),
  captureRect: (rect) => ipcRenderer.invoke('images:capture-page', rect),
  captureWebview: (contentsId) => ipcRenderer.invoke('images:capture-webview', contentsId),
  saveAttachment: (attachment) => ipcRenderer.invoke('chat:save-attachment', attachment),
  getAttachment: (id) => ipcRenderer.invoke('chat:get-attachment', id),
  setLocale: (code) => ipcRenderer.invoke('i18n:set-locale', code),
  getProject: () => ipcRenderer.invoke('workspace:get-project'),
  listMemory: () => ipcRenderer.invoke('memory:list'),
  addMemory: (entry) => ipcRenderer.invoke('memory:add', entry),
  updateMemory: (id, changes) => ipcRenderer.invoke('memory:update', { id, changes }),
  deleteMemory: (id) => ipcRenderer.invoke('memory:delete', id),
  deletePathForAi: (path) => ipcRenderer.invoke('tools:delete-path', path),
  movePathForAi: (request) => ipcRenderer.invoke('tools:move-path', request),
  createDirectoryForAi: (path) => ipcRenderer.invoke('tools:create-directory', path),
  createFileForAi: (request) => ipcRenderer.invoke('tools:create-file', request),
  createProjectForAi: (request) => ipcRenderer.invoke('tools:create-project', request),
  moveSubprojectOut: (directory) => ipcRenderer.invoke('workspace:move-subproject-out', directory),
  moveProjectIn: (directory) => ipcRenderer.invoke('workspace:move-project-in', directory),
  getProjectIcon: (directory) => ipcRenderer.invoke('projects:get-icon', directory),
  pickProjectIcon: () => ipcRenderer.invoke('projects:pick-icon'),
  saveProjectIcon: (request) => ipcRenderer.invoke('projects:save-icon', request),
  removeProjectIcon: (directory) => ipcRenderer.invoke('projects:remove-icon', directory),
  moveProject: (directory) => ipcRenderer.invoke('workspace:move-project', directory),
  revealProject: (directory) => ipcRenderer.invoke('projects:reveal', directory),
  listLinks: () => ipcRenderer.invoke('links:list'),
  removeLink: (target) => ipcRenderer.invoke('links:remove', target),
  updateLink: (target) => ipcRenderer.invoke('links:update', target),
  revealLink: (target) => ipcRenderer.invoke('links:reveal', target),
  copyConversationToProject: (request) => ipcRenderer.invoke('chat:copy-to-project', request),
  createEntry: (request) => ipcRenderer.invoke('workspace:create-entry', request),
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getLatestRelease: (silent = false) => ipcRenderer.invoke('app:latest-release', silent),
  openRelease: (url) => ipcRenderer.invoke('app:open-release', url),
  openLink: (url) => ipcRenderer.invoke('app:open-link', url),
  pickImage: () => ipcRenderer.invoke('images:pick'),
  importImage: (request) => ipcRenderer.invoke('images:import', request),
  getProjectSettingsFor: (directory) => ipcRenderer.invoke('projects:get-settings', directory),
  saveProjectSettingsFor: (directory, settings) => ipcRenderer.invoke('projects:save-settings', { directory, settings }),
  copyProjectContext: (request) => ipcRenderer.invoke('projects:copy-context', request),
  getMainProject: () => ipcRenderer.invoke('workspace:get-main'),
  listProjects: () => ipcRenderer.invoke('workspace:list-projects'),
  openProject: (directory) => ipcRenderer.invoke('workspace:open-project', directory),
  createProject: (name) => ipcRenderer.invoke('workspace:create-project', name),
  removeProject: (directory) => ipcRenderer.invoke('workspace:remove-project', directory),
  chooseProject: () => ipcRenderer.invoke('workspace:choose-project'),
  listDirectory: (directory) => ipcRenderer.invoke('workspace:list-directory', directory),
  saveMarkdown: (payload) => ipcRenderer.invoke('document:save-markdown', payload),
  exportDocx: (html) => ipcRenderer.invoke('document:export-docx', { html }),
  printDocument: (html) => ipcRenderer.invoke('document:print', { html }),
  exportPdf: (html) => ipcRenderer.invoke('document:export-pdf', { html }),
  skills: {
    list: (request) => ipcRenderer.invoke('skills:list', request),
    get: (request) => ipcRenderer.invoke('skills:get', request),
    save: (request) => ipcRenderer.invoke('skills:save', request),
    remove: (request) => ipcRenderer.invoke('skills:delete', request),
    parse: (markdown) => ipcRenderer.invoke('skills:parse', markdown),
    openFolder: (request) => ipcRenderer.invoke('skills:open-folder', request),
    setActive: (request) => ipcRenderer.invoke('skills:set-active', request),
    // Sceglie un file Markdown e ne restituisce i campi della skill (null se annullato), senza salvarla.
    importFile: () => ipcRenderer.invoke('skills:import-file'),
  },
  ai: {
    getSettings: () => ipcRenderer.invoke('ai:get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('ai:save-settings', settings),
    getStatus: (provider) => ipcRenderer.invoke('ai:status', provider),
    login: (provider) => ipcRenderer.invoke('ai:login', provider),
    submitLoginCode: (code) => ipcRenderer.invoke('ai:login-code', code),
    listModels: (request) => ipcRenderer.invoke('ai:models', request),
    listModelInputs: (request) => ipcRenderer.invoke('ai:model-inputs', request),
    hasApiKey: (provider) => ipcRenderer.invoke('ai:has-api-key', provider),
    saveApiKey: (value, provider) => ipcRenderer.invoke('ai:save-api-key', value, provider),
    chat: (messages) => ipcRenderer.invoke('ai:chat', messages),
    getCapabilities: (model) => ipcRenderer.invoke('ai:capabilities', model),
    // Allegati della chat: percorsi scelti dall'utente (solo i tipi indicati), lettura di un file (immagine o PDF), normalizzazione di un'immagine in base64.
    pickAttachments: (types) => ipcRenderer.invoke('chat:pick-attachments', types),
    readAttachment: (path) => ipcRenderer.invoke('chat:read-attachment', path),
    prepareImage: (data) => ipcRenderer.invoke('chat:prepare-image', { data }),
    // Risposta in streaming: onEvent riceve { type: 'text' | 'thinking' | 'status' | 'usage', delta | text | input+output }; cancel() interrompe.
    chatStream: (messages, onEvent, options = {}) => {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const listener = (_event, payload) => { if (payload.requestId === requestId) onEvent(payload.event) }
      ipcRenderer.on('ai:stream', listener)
      const promise = ipcRenderer.invoke('ai:chat-stream', { requestId, messages, tools: options.tools }).then((result) => {
        if (result === null) throw new Error('Richiesta interrotta')
        return result
      }).finally(() => ipcRenderer.removeListener('ai:stream', listener))
      return { promise, cancel: () => ipcRenderer.invoke('ai:cancel', requestId) }
    },
  },
  // Documenti aperti dal sistema: quelli arrivati prima che il renderer fosse pronto, poi quelli successivi.
  takeExternalDocuments: () => ipcRenderer.invoke('document:take-external'),
  onExternalDocument: (callback) => {
    const listener = (_event, document) => callback(document)
    ipcRenderer.on('document:external', listener)
    return () => ipcRenderer.removeListener('document:external', listener)
  },
  onAppCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('app:command', listener)
    return () => ipcRenderer.removeListener('app:command', listener)
  },
  onDocumentCommand: (callback) => {
    const listener = (_event, command) => callback(command)
    ipcRenderer.on('document:command', listener)
    return () => ipcRenderer.removeListener('document:command', listener)
  },
})
