# electron/preload.cjs

Source: [`electron/preload.cjs`](../../electron/preload.cjs)

Secure bridge between the renderer and the main process, exposed as `window.electronAPI` through `contextBridge`. Declares one function per IPC channel, grouped by concern: documents, sessions, workspace, project settings, spell checking, history, conversations and attachments, notes, assistant tools, projects, images, AI providers, streaming chat with cancellation, and app or document commands.