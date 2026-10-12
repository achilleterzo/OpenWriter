# src/hooks

React hooks.

## useDocumentFileCommands.js

Source: [`src/hooks/useDocumentFileCommands.js`](../hooks/useDocumentFileCommands.js)

Hook that applies native-menu document commands to the active tab, subscribing through `onDocumentCommand`.

- `find` / `replace`: forwards to `workspace.requestFind` (Ctrl+F / Ctrl+H).
- `new`: opens a new untitled tab; `close-tab`: closes the active tab (confirmation if dirty, handled in App).
- `open`: file dialog through `electronAPI.openDocument`, then `workspace.openDocument`.
- `save` / `save-as`: `saveMarkdown` with the editor Markdown and save-as flag; on success `workspace.markSaved` and status update.
- `export-docx` / `export-pdf`: exports the editor HTML through the corresponding IPC.
- Errors are logged and surface as a generic status message.

