const { contextBridge, ipcRenderer } = require('electron')

// Il ponte tra il processo principale e la pagina del contesto WebGPU (gpu-context.cjs): la pagina riceve richieste e risponde, nient'altro.
contextBridge.exposeInMainWorld('owEmbedder', {
  onRequest: (callback) => ipcRenderer.on('embed:request', (_event, message) => callback(message)),
  reply: (id, payload) => ipcRenderer.send('embed:reply', id, payload),
})
