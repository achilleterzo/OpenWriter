const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openDocument: () => ipcRenderer.invoke('document:open'),
  openDocumentPath: (filePath) => ipcRenderer.invoke('document:open-path', filePath),
  reopenDocument: (filePath) => ipcRenderer.invoke('document:reopen', filePath),
  loadSession: () => ipcRenderer.invoke('session:load'),
  saveSession: (session) => ipcRenderer.invoke('session:save', session),
  saveSessionSync: (session) => ipcRenderer.sendSync('session:save-sync', session),
  getDroppedPaths: (files) => files.map((file) => webUtils.getPathForFile(file)).filter(Boolean),
  importFiles: (request) => ipcRenderer.invoke('workspace:import-files', request),
  getProjectSettings: () => ipcRenderer.invoke('project:get-settings'),
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
  revealPath: (target) => ipcRenderer.invoke('workspace:reveal-path', target),
  getSpellcheck: () => ipcRenderer.invoke('spellcheck:get'),
  setSpellcheckLanguages: (languages) => ipcRenderer.invoke('spellcheck:set-global', languages),
  listConversations: () => ipcRenderer.invoke('chat:list'),
  getConversation: (id) => ipcRenderer.invoke('chat:get', id),
  createConversation: (conversation) => ipcRenderer.invoke('chat:create', conversation),
  saveConversation: (conversation) => ipcRenderer.invoke('chat:save', conversation),
  deleteConversation: (id) => ipcRenderer.invoke('chat:delete', id),
  openChatFolder: () => ipcRenderer.invoke('chat:open-folder'),
  listDirectoryForAi: (path) => ipcRenderer.invoke('tools:list-directory', path),
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
  createEntry: (request) => ipcRenderer.invoke('workspace:create-entry', request),
  openLink: (url) => ipcRenderer.invoke('app:open-link', url),
  pickImage: () => ipcRenderer.invoke('images:pick'),
  importImage: (request) => ipcRenderer.invoke('images:import', request),
  listProjects: () => ipcRenderer.invoke('workspace:list-projects'),
  openProject: (directory) => ipcRenderer.invoke('workspace:open-project', directory),
  createProject: (name) => ipcRenderer.invoke('workspace:create-project', name),
  removeProject: (directory) => ipcRenderer.invoke('workspace:remove-project', directory),
  chooseProject: () => ipcRenderer.invoke('workspace:choose-project'),
  listDirectory: (directory) => ipcRenderer.invoke('workspace:list-directory', directory),
  saveMarkdown: (payload) => ipcRenderer.invoke('document:save-markdown', payload),
  exportDocx: (html) => ipcRenderer.invoke('document:export-docx', { html }),
  exportPdf: (html) => ipcRenderer.invoke('document:export-pdf', { html }),
  ai: {
    getSettings: () => ipcRenderer.invoke('ai:get-settings'),
    saveSettings: (settings) => ipcRenderer.invoke('ai:save-settings', settings),
    getStatus: (provider) => ipcRenderer.invoke('ai:status', provider),
    login: (provider) => ipcRenderer.invoke('ai:login', provider),
    submitLoginCode: (code) => ipcRenderer.invoke('ai:login-code', code),
    listModels: (request) => ipcRenderer.invoke('ai:models', request),
    hasApiKey: () => ipcRenderer.invoke('ai:has-api-key'),
    saveApiKey: (value) => ipcRenderer.invoke('ai:save-api-key', value),
    chat: (messages) => ipcRenderer.invoke('ai:chat', messages),
    getCapabilities: (model) => ipcRenderer.invoke('ai:capabilities', model),
    // Risposta in streaming: onEvent riceve { type: 'text' | 'thinking' | 'status', delta | text }; cancel() interrompe.
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
