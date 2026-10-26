# electron/preload.cjs

Source: [`electron/preload.cjs`](../../../electron/preload.cjs)

Secure bridge between the renderer and the main process, exposed as `window.electronAPI` through `contextBridge`. One function per IPC channel, grouped by concern.

- Preferences: `preferences.values`, read synchronously at startup so the page knows the theme and the language immediately, and `preferences.set` ([preferences.js](../../src/lib/preferences.js.md)).
- Documents: open, open a path (with options), reopen, take the documents the system handed over before the renderer was ready; save as Markdown, export a self-contained Markdown, export DOCX, print, export PDF.
- Sessions: load, save, and a synchronous save on unload.
- Workspace: import files, start a drag out, resolve dropped files to paths (`webUtils.getPathForFile`), rename, delete, reveal, create an entry, move into a folder, directory listing, watch for external changes (`watchWorkspace`, `onWorkspaceChanged`, `onAnnotationsChanged`), file info, project get/open/create/choose/remove/list, move a project, sub-project in and out, project settings (also for a project that is not open), export and apply a project setup, copy the context from another project, the main project.
- Project extras: linked documents (`listLinks`, `updateLink`, `removeLink`, `revealLink`), reference folders (`listReferences`, `addReference`, `updateReference`, `removeReference`, `revealReference`), icons (`getProjectIcon`, `pickProjectIcon`, `saveProjectIcon`, `removeProjectIcon`).
- History, notes, bookmarks, memory (`list`, `add`, `update`, `delete`), conversations and attachments, skills (the `skills` namespace, including `importFile`), spell checking, i18n locale.
- Assistant file tools: list, read, create, move, delete, create a directory, create a project.
- Images: fetch, read a file, read and write the saved description of an image (`readImageDescription`, `writeImageDescription`), pick, import, page and webview screenshots.
- Workspace paths: rename, delete one or several (`deletePaths`, for a selection), reveal, create an entry, move a project or a sub-project in and out.
- Fonts (`fonts` namespace): catalog, list, install, remove.
- Browser history (`browserHistory` namespace, with `{ agent: true }` for the assistant's own history), and saving a browser screenshot.
- File clipboard (`copyFilesToClipboard`, `pasteFilesFromClipboard`).
- Dialogs: `onDialogAsk` and `answerDialog`, so a confirmation asked by the main process is shown in the internal dialog window.
- `getMcpConfig`: command and arguments to start the MCP server from an agent's client; `getMcpHttp` and `setMcpHttp` read and change the HTTP server (its status, turning it on and off, renewing the token). The bridge to the running application: `onMcpRequest` receives a tool the agent asked to run on the open editor (or a project or a document to open, or a task for the assistant), and `answerMcp` sends the result back.
- The `ai` namespace: settings, status, provider login and code submission, model listing and accepted inputs per model (`listModelInputs`), encrypted API key presence and storage, non-streaming `chat`, `getCapabilities`, chat attachments (`pickAttachments`, `readAttachment`, `prepareImage`), and `chatStream` (per-request id, streamed `text`/`thinking`/`status`/`usage` events, and `cancel()`).
- Events: `onEditContextMenu`, `onAppCommand`, `onDocumentCommand`, `onExternalDocument`, `onDialogAsk`.

