# src/hooks

React hooks.

## useDocumentFileCommands.js

Source: [`src/hooks/useDocumentFileCommands.js`](../hooks/useDocumentFileCommands.js)

Hook that applies native-menu document commands to the active tab, subscribing through `onDocumentCommand`.

- `find` / `replace`: forwards to `workspace.requestFind` (Ctrl+F / Ctrl+H).
- `new`: opens a new untitled tab; `close-tab`: closes the active tab (confirmation if dirty, handled in App).
- `open`: file dialog through `electronAPI.openDocument`, then `workspace.openDocument`.
- `save` / `save-as`: `workspace.saveTab` with the save-as flag; on success the status says "Saved".
- `export-docx` / `export-pdf`: exports the editor HTML through the corresponding IPC, reporting the result.
- `export-markdown-embedded`: exports a self-contained Markdown ([markdown-embed.cjs](../../electron/markdown-embed.cjs.md)) with the editor Markdown and the document path, reporting how many images were embedded and how many could not be.
- `print`: prints the editor HTML through the hidden print window.

Errors are logged and surface as a generic status message.