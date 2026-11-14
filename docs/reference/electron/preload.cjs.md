# electron/preload.cjs

Source: [`electron/preload.cjs`](../../../electron/preload.cjs)

Secure bridge between the renderer and the main process, exposed as `window.electronAPI` through `contextBridge`. One function per IPC channel, grouped by concern.

- Preferences: `preferences.values`, read synchronously at startup so the page knows the theme and the language immediately, and `preferences.set` ([preferences.js](../../src/lib/preferences.js.md)).
- Documents: open, open a path (with options), reopen, take the documents the system handed over before the renderer was ready; save as Markdown, export a self-contained Markdown, export DOCX, print, export PDF.
- Sessions: load, save, and a synchronous save on unload.
- Workspace: import files, start a drag out, resolve dropped files to paths (`webUtils.getPathForFile`), rename, delete, reveal, create an entry, move into a folder, directory listing, watch for external changes (`watchWorkspace`, `onWorkspaceChanged`, `onAnnotationsChanged`), file info, project get/open/create/choose/remove/list, move a project, sub-project in and out, project settings (also for a project that is not open, plus `setProjectQuickActions` for its quick actions, `setProjectAiOptions` for the approval and the tool groups of the assistant in that project (`project:set-ai-options`) and `getContextChain` for the `.ow` instructions enclosing a document), export and apply a project setup, copy the context from another project, the main project.
- Project extras: linked documents (`listLinks`, `updateLink`, `removeLink`, `revealLink`), reference folders (`listReferences`, `addReference`, `updateReference`, `removeReference`, `revealReference`), icons (`getProjectIcon`, `pickProjectIcon`, `saveProjectIcon`, `removeProjectIcon`).
- History, notes, bookmarks, memory (`list`, `add`, `update`, `delete`), conversations and attachments, skills (the `skills` namespace, including `importFile`), spell checking, i18n locale.
- Assistant file tools: list, read, create, move, delete, create a directory, create a project, and the text search (`searchFilesForAi`, which also reaches the reference folders with the `@name/…` prefix).
- Knowledge index and meaning model: `getKnowledgeStatus` and `rebuildKnowledge` for one project, `getIndexActivity` (`knowledge:activity`, the `{ scanning, vectors }` progress of the index), and the `semantic` group — `getSemanticStatus`, `installSemanticPack`, `removeSemanticPack`, `setSemanticDevice`, `setGpuPower`, `probeGpu`, `setSemanticEnabled`.
- Projects Home: `getProjectGraph` (`projects:graph`, the graph with its synapses), `searchProjects` (`projects:search`, the agent-like search of the Home) and `setProjectQuickActionsFor` (the quick actions of a project that is not open).
- Windows: `openProjectInNewWindow(directory)` (`project:open-new-window`) opens a project in another window, that is another instance of the app ([instance-registry.cjs](instance-registry.cjs.md), [primary-instance.cjs](primary-instance.cjs.md)); with no directory the folder is asked for. A project already open here, or open in another window — which is brought to the front instead — comes back as an error.
- `layoutStorage` is a `localStorage`-shaped object (`getItem`, `setItem`, `removeItem`, `keys`, synchronous) over the `layout:get` / `layout:set` / `layout:remove` / `layout:keys` channels: the arrangement of the bubbles of the Home is kept in a file of the application data, so every window sees the same network ([graphLayoutStore.js](../src/lib/graphLayoutStore.js.md)).
- Editor commands from the native menu and the context menu: `setViewMode` (`view:changed`, the endless or paged view), `editAction`, `replaceMisspelling`, `addToDictionary`.
- Images: fetch, read a file, read and write the saved description of an image (`readImageDescription`, `writeImageDescription`), pick, import, page and webview screenshots, and `copyImage` / `saveImage` (the buttons on an image of the chat: `images:copy` and `images:save`, which writes a PNG or the original bytes where the user chooses).
- Workspace paths: rename, delete one or several (`deletePaths`, for a selection), reveal, create an entry, move a project or a sub-project in and out.
- Fonts (`fonts` namespace): catalog, list, install, remove.
- Browser history (`browserHistory` namespace, with `{ agent: true }` for the assistant's own history), and saving a browser screenshot.
- File clipboard (`copyFilesToClipboard`, `pasteFilesFromClipboard`).
- Dialogs: `onDialogAsk` and `answerDialog`, so a confirmation asked by the main process is shown in the internal dialog window.
- `getMcpConfig`: command and arguments to start the MCP server from an agent's client; `getMcpHttp` and `setMcpHttp` read and change the HTTP server (its status, turning it on and off, renewing the token). The bridge to the running application: `onMcpRequest` receives a tool the agent asked to run on the open editor (or a project or a document to open, or a task for the assistant), and `answerMcp` sends the result back.
- The `ai` namespace: settings, status, provider login and code submission, model listing and accepted inputs per model (`listModelInputs`), encrypted API key presence and storage, non-streaming `chat`, `getCapabilities`, chat attachments (`pickAttachments`, `readAttachment`, `prepareImage`), and `chatStream` (per-request id, streamed `text`/`thinking`/`status`/`usage` events, and `cancel()`).
- Events: `onEditContextMenu`, `onAppCommand`, `onDocumentCommand`, `onExternalDocument`, `onDialogAsk`.

`takeExternalProjects` / `onExternalProject`: folders to open as a project (file manager entry, command line). `getIntegrationStatus`, `setMarkdownAssociation(on)`, `setFolderMenu(on)`, `openDefaultApps()`: system integration (see [system-integration.cjs](system-integration.cjs.md)).

`openTextFile(path)` and `saveTextFile({ filePath, text, eol, bom, saveAs })`: the text reader (see [text-file.cjs](text-file.cjs.md)).

`onAppNotice(callback)`: the errors and warnings of the main process, arriving on `app:notice` as `{ level, message, detail }` and shown as notifications ([toasts.js](../../src/lib/toasts.js.md)).

`mcp`: the client side of MCP for the settings and the chat (`list`, `saveServer`, `removeServer`, `setUse`, `trustServer`, `testServer`, `tools`, `callTool`), see [mcp-service.cjs](mcp-service.cjs.md).

`setHomeOpen(open)`: tells the main process that the projects Home is open (`home:changed`), so the menu disables the entries that act on a document that is not on screen ([menu.cjs](menu.cjs.md)). `searchKnowledgeForAi(args)` is the search of the assistant over the index (`tools:search-knowledge`), and the AI requests carry the temperature level with the other options (`ai:chat-stream`).

Workspaces: `listAllProjects` (`workspaces:all-projects`, every project on disk regardless of the workspace), `listWorkspaces`, `createWorkspace`, `renameWorkspace`, `setWorkspaceMembers`, `addProjectToWorkspace`, `removeProjectFromWorkspace`, `removeWorkspace`, `setActiveWorkspace`, `addTemporaryProject`, `dismissTemporaryProject`, `adoptTemporaryProject`, `onWorkspacesChanged(callback)` (see [workspaces-store.cjs](workspaces-store.cjs.md)).