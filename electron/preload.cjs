const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  openDocument: () => ipcRenderer.invoke('document:open'),
  saveMarkdown: (payload) => ipcRenderer.invoke('document:save-markdown', payload),
  exportDocx: (html) => ipcRenderer.invoke('document:export-docx', { html }),
  exportPdf: (html) => ipcRenderer.invoke('document:export-pdf', { html }),
  getCodexStatus: () => ipcRenderer.invoke('codex:status'),
  connectCodex: (executable) => ipcRenderer.invoke('codex:connect', { executable }),
  disconnectCodex: () => ipcRenderer.invoke('codex:disconnect'),
  onCodexStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('codex:status', listener)
    return () => ipcRenderer.removeListener('codex:status', listener)
  },
  onCodexLog: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('codex:log', listener)
    return () => ipcRenderer.removeListener('codex:log', listener)
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
