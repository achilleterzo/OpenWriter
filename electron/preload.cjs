const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openDocument: () => ipcRenderer.invoke('document:open'),
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
