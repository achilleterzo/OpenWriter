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

## useSharedChatRun.js

Source: [`src/hooks/useSharedChatRun.js`](../../../src/hooks/useSharedChatRun.js)

The work of the assistant on a conversation, seen from a window that is not driving it. `useSharedChatRun({ api, project, conversationId, driving, onChanged, onCancel })` returns `{ running, live }`: `running` is true only while another window drives the conversation shown here, `live` is the text so far (`{ text, thinking, status }`) or `null`.

- When the conversation (or the project) changes it asks for the snapshot (`chatRuns.list`), so a window that opens late finds the text already written; then it follows `chatRuns.onState` and `chatRuns.onLive`.
- `onChanged(event)` is called for every `chat:changed` from the other windows (a conversation saved, its queue changed, a conversation deleted) and when a run ends, so the panel can reload what is on disk.
- `onCancel(event)` is called, on the driving window only, when another window asks to stop the work.

