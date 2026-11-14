# src/hooks

React hooks.

## useDocumentFileCommands.js

Source: [`src/hooks/useDocumentFileCommands.js`](../../../src/hooks/useDocumentFileCommands.js)

Hook that applies native-menu document commands to the active tab, subscribing through `onDocumentCommand`.

- `select-all`: forwards to `onSelectAll`.
- `find` / `replace`: forwards to `workspace.requestFind` (Ctrl+F / Ctrl+H).
- `new`: opens a new untitled tab; `close-tab`: closes the active tab (confirmation if dirty, handled in App).
- `open`: file dialog through `electronAPI.openDocument`, then `workspace.openLoaded`.
- `extract-markdown-images`: extracts the embedded images of the active document with `workspace.extractImages`.
- On a text tab (`kind === 'text'`) only `save` and `save-as` are handled, through `workspace.saveText` (status "Saved"); the export and print commands do not concern the text reader.
- `save` / `save-as`: `workspace.saveTab` with the save-as flag; on success the status says "Saved".
- `export-docx` / `export-pdf`: exports the editor HTML through the corresponding IPC, reporting the result.
- `export-markdown-embedded`: exports a self-contained Markdown ([markdown-embed.cjs](../../electron/markdown-embed.cjs.md)) with the editor Markdown and the document path, reporting how many images were embedded and how many could not be.
- `print`: prints the editor HTML through the hidden print window.

Errors are logged and surface as a generic status message.

## useWorkspaces.js

Source: [`src/hooks/useWorkspaces.js`](../../../src/hooks/useWorkspaces.js)

The workspaces for the interface: `{ active, workspaces, temporary, activeWorkspace, refresh }`. `active` is the id of the active workspace (`all` = every project), `activeWorkspace` its definition (null for All), `temporary` the paths of the temporary members (projects opened by an agent). It also says whether the data have `loaded` (before that the list is empty, which does not mean there are no workspaces). It reads again whenever something changes (`workspaces:changed`), also when an agent changed it. Used by [WorkspaceSelector.jsx](components/pages/WorkspaceSelector.jsx.md), [ProjectsPanel.jsx](components/pages/ProjectsPanel.jsx.md) and [ProjectsHome.jsx](components/pages/ProjectsHome.jsx.md).