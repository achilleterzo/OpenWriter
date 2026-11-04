---

# electron/semantic-pack.cjs

Source: [`electron/semantic-pack.cjs`](../../../electron/semantic-pack.cjs)

The "semantic pack": what the search by meaning needs and that does **not** ship with the app, because it weighs about 150 MB. It is downloaded only when the user asks for it (button in the project settings), lives in the app data folder (`userData/semantic/multilingual-e5-small-q8`, never in a project) and can be removed at any time. Without it everything works as before: the search by words ([knowledge-index.cjs](knowledge-index.cjs.md)) does not depend on it.

Contents (`FILES`): the multilingual embedding model `Xenova/multilingual-e5-small`, 8-bit quantized (118 MB) with its tokenizer, from Hugging Face at a fixed revision; and the three files of the ONNX runtime in WebAssembly (`onnxruntime-web` 1.31.1, Node build, 15 MB) from the npm package through jsDelivr, the same on every system (no native library per platform). Every file has a pinned size and SHA-256: a file that does not match is discarded. The app itself carries only the two small npm packages the runtime needs (`onnxruntime-common`, copied next to the downloaded files) and the tokenizer library (`@huggingface/tokenizers`).

- `createSemanticPack({ directory, fetchImpl, commonSource, files })`: `fetchImpl` is Electron's `net.fetch` in `main.cjs` (it follows the system proxy and certificates) and a fake in tests; `commonSource` is the folder of the `onnxruntime-common` package.
  - `install({ onProgress, signal })`: downloads every file to `<name>.part`, hashes while writing, renames when it matches, copies `onnxruntime-common` into `node_modules` and writes `ready.json` last. A file already verified by an interrupted attempt is not downloaded again. One install at a time (a second call gets the same promise). Rejects, with the file name, on network error, wrong size or hash mismatch.
  - `ready`, `status()` returns `{ state: 'missing' | 'installing' | 'ready', received, total, file, totalBytes, error }`; `directory`; `remove()` (refused while installing).

Tests: [tests/semantic-pack.test.cjs](../../../tests/semantic-pack.test.cjs).
