---

# electron/knowledge-worker.cjs

Source: [`electron/knowledge-worker.cjs`](../../../electron/knowledge-worker.cjs)

The worker thread that owns the search index, so that reading files and indexing never block the interface. `workerData` is `{ file, hiddenDirectories }`. It answers requests `{ id, op, ...}` with `{ id, result }` or `{ id, error }`; operations: `sync` (full scan), `paths` (update given paths), `search`, `stats`, `clear`, `rebuild` (clear the project and scan again), `semantic` (configure the search by meaning: `{ directory, projects, model, purge }`), `semanticStatus`, `close`. The logic is in [knowledge-index.cjs](knowledge-index.cjs.md) and [knowledge-sync.cjs](knowledge-sync.cjs.md); the main process talks to it through [knowledge-service.cjs](knowledge-service.cjs.md).

**Vectors**: if the semantic pack is installed (`directory`) and a project asked for it, after every `sync`, `paths`, `rebuild` and `semantic` the worker computes in the background, 8 passages at a time, the vectors still missing for the configured projects (the open project and its reference folders), then prunes the orphans; changes that arrive while it runs are picked up in the same pass. `search` with `options.semantic` embeds the question (`query: `) and passes `queryVector` to the index. The embedder (in its own thread, 8 passages per batch) is started on first use and dropped when the pack is removed or the project does not use it. Any failure (missing or broken model, memory) stops at `semanticStatus().error` and the search by words keeps working; an uncaught error from the runtime threads is caught so it cannot take the index down.
