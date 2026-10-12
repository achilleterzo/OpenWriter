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
  showExplorerMenu: (request) => ipcRenderer.invoke('explorer:context-menu', request),
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
  getProject: () => ipcRenderer.invoke('workspace:get-project'),
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
