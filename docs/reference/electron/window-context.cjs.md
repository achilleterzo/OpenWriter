# electron/window-context.cjs

Source: [`electron/window-context.cjs`](../../../electron/window-context.cjs)

Everything that depends on the project a window has open: the project itself and the stores that live inside it. Before, the project was a variable of the process (`projectPath` in `main.cjs`) and the stores were constants built on it; now they are one object, so that a window can have its own and none shares another window's project by accident. The plan is in [Core and windows](../../design/core-and-windows.md) (steps 1 and 3: one context per window, created when the window is opened).

- `createWindowContext({ mainDirectory, readDocument })` returns the context. `mainDirectory()` is the folder of the "main" project, used by the stores when no project is open; `readDocument(filePath)` is how the assistant's project tools read a document.
- `context.project` is the open project (`null` for none). It is a getter and a setter: the stores read it at every call, so `context.project = directory` applies to all of them at once.
- The stores it holds: `projectFile`, `chatStore`, `memoryStore`, `browserHistory`, `agentBrowserHistory` (and `historyFor(agent)` to pick one), `notesStore`, `bookmarksStore`, `linksStore`, `referencesStore`, `webStore`, `projectTools`, plus `storePath()` (the open project, or the main one).
- The state of the window that is not a store: `first` (the first window of the process, the only one that restores the session after an interrupted start and clears the temporary workspace members), `slot` (0 for the first window on a project, 1… for the others: the session is per window), `knowledgeOn` (the search index is on for its project), `referenceWatchers`, `workspaceWatcher`, `workspaceWatchTimer`, `annotationsWatchTimer`, `changedPaths` (what it watches), `viewMode` and `homeOpen` (what the menu shows).
- What does not depend on a window stays in the process: the project list, the workspaces, the settings, the knowledge index.
