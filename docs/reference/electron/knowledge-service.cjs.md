---

# electron/knowledge-service.cjs

Source: [`electron/knowledge-service.cjs`](../../../electron/knowledge-service.cjs)

Main-process client of the search index worker ([knowledge-worker.cjs](knowledge-worker.cjs.md)). `createKnowledgeService({ file, hiddenDirectories, createWorker, debounceMs })` starts the worker on the first request (`createWorker(workerData)` returns a `Worker`; injected so tests can use their own).

- `sync(project)`, `search(project, query, options)`, `stats(project)`, `rebuild(project)`: promises answered by the worker.
- `changed(project, relatives)`: the folder watcher reports changed paths (relative to the project); they are collected and sent together after `debounceMs` (800 ms). `null` asks for a full scan.
- `semanticConfigure({ device, model, directory, projects, purge })`, `semanticStatus(projects)` returns `{ total, embedded, running, error, active, device, model }`: the search by meaning (see [knowledge-worker.cjs](knowledge-worker.cjs.md)); `search` takes `options.semantic`. The options `gpuEmbed(texts, kind)` / `gpuRelease()` (the GPU device lives in the main process, [gpu-context.cjs](gpu-context.cjs.md)) and `onSemanticError({ device, model, error })` (a failure reported by the worker) are given to `createKnowledgeService`.
- `syncing`: true while scans or updates are running or waiting (for the progress bar).
- `available` / `error`: the index is an extra, so if the worker cannot start or stops, the service becomes unavailable, requests are rejected with a clear message and the app works as before (`search_files` remains).
- `key(project)`: the key used for a project in the index (absolute path, lower case on Windows, where paths are case-insensitive).
- `close()`.

In `main.cjs` the service is created at start (database `knowledge.db` in the user data folder), a full scan starts whenever a project is initialised (`initializeProject`) and the project watcher (`workspace:watch`) feeds `changed`. `.ow` is ignored by the watcher.

`markTerms(text, query)` marks with « » the words of the search in the headings path (the snippet already marks them in the text): without accents or capitals, a word that starts with a searched word is marked whole, and one-letter words are not marked; a passage can answer because its heading has the word. `formatKnowledgeResults(query, { mode, results }, { files }, readTool = 'read_file')` turns a search into the text the assistant reads (in `hybrid` mode the header says the passages were chosen by words and meaning; one block per passage: `path:start-end — headings`, the snippet, a reminder to verify with `read_file`; messages for an empty or still-building index). It is served by the IPC `tools:search-knowledge` (`searchKnowledgeForAi` in the preload), used by the assistant tool `search_knowledge`.

**What is stored where**: the index never holds anything that is not in the project files. Project memory, notes and bookmarks stay in the project's `.ow` folder and travel with it; whatever will be indexed from them later is read from those files, so deleting `knowledge.db` and opening the project rebuilds the same state.

**Reference folders (shared knowledge)**: the folders a user links to a project (`.ow/references.json`, read-only, `@name/…`) are the way to share knowledge between projects, and linking is the consent: the choice lives in the project and travels with it. Each reference folder is indexed once under its own key, even if several projects link it (`startKnowledge` scans them when the project opens; `watchReferences` keeps them up to date; removing or relinking a reference clears its entries, which any other project using it rebuilds at its next opening). `tools:search-knowledge` searches the project and its references together by default (`scope`: `all`, `project`, `references`; a `path` of `@name/…` restricts to that reference) and writes the paths of references as `@name/…`. The MCP `search_knowledge` covers them too (see [mcp-server.cjs](mcp-server.cjs.md)).

**Other projects**: besides references, `tools:search-knowledge` searches the user's other projects that share their knowledge ([shared-knowledge.cjs](shared-knowledge.cjs.md)); `scope` is `all` (default), `project` or `others` (references and other projects; `references` is still accepted as an alias), and `path: "@name"` restricts to one of them.

`synonyms(words)` asks the worker for the words of the texts closest in meaning to the searched ones (see [knowledge-worker.cjs](knowledge-worker.cjs.md)).
