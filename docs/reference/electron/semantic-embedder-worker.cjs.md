---

# electron/semantic-embedder-worker.cjs

Source: [`electron/semantic-embedder-worker.cjs`](../../../electron/semantic-embedder-worker.cjs)

The thread that computes the vectors ([semantic-embedder.cjs](semantic-embedder.cjs.md), `createThreadedEmbedder`). `workerData` is `{ directory }` (the semantic pack); it loads the model once and answers `{ id, op: 'embed', texts, kind }` with `{ id, vectors }` (the buffers are transferred, not copied) and `{ id, op: 'close' }`; any error comes back as `{ id, error }`, and an uncaught error from the runtime threads is reported with `id: 0` so the client fails its pending requests.

Why a thread of its own: the WebAssembly runtime runs the inference synchronously in the calling thread. In the first version it ran in the index worker, whose queue (search, status, rebuild, updates) then starved for as long as the vectors of a whole project were computed (many minutes), so the settings page showed no status and the rebuild button stayed disabled. Now the index worker only awaits messages and answers in a few milliseconds even while the model is busy (measured on a copy of a real index: 1 to 70 ms).
