---

# electron/semantic-pack.cjs

Source: [`electron/semantic-pack.cjs`](../../../electron/semantic-pack.cjs)

The "semantic packs": what the search by meaning needs and that does **not** ship with the app, because they weigh about 150 MB (CPU) and 280 MB (graphics card). There is one pack per device, each in its own folder and with its own vectors in the index, so switching device only computes what is missing. It is downloaded only when the user asks for it (button in the project settings), lives in the app data folder (`userData/semantic/multilingual-e5-small-q8`, never in a project) and can be removed at any time. Without it everything works as before: the search by words ([knowledge-index.cjs](knowledge-index.cjs.md)) does not depend on it.

Contents (`FILES`): the multilingual embedding model `Xenova/multilingual-e5-small`, 8-bit quantized (118 MB) with its tokenizer, from Hugging Face at a fixed revision; and the three files of the ONNX runtime in WebAssembly (`onnxruntime-web` 1.31.1, Node build, 15 MB) from the npm package through jsDelivr, the same on every system (no native library per platform). Every file has a pinned size and SHA-256: a file that does not match is discarded. The app itself carries only the two small npm packages the runtime needs (`onnxruntime-common`, copied next to the downloaded files) and the tokenizer library (`@huggingface/tokenizers`).

**CPU pack** (`PACKS.cpu`, id `multilingual-e5-small-q8`): the model above, run by [semantic-embedder.cjs](semantic-embedder.cjs.md) in a Node thread.

**Graphics card pack** (`PACKS.gpu`, id `multilingual-e5-small-fp16-webgpu`, `GPU_FILES`): the same model in fp16 (`model_fp16.onnx`, 235 MB: the GPU works better in floating point than in 8 bit), its tokenizer, and the WebGPU build of `onnxruntime-web` 1.31.1 (`ort.webgpu.bundle.min.mjs` plus the **asyncify** WebAssembly module; the older `jsep` module has no WebGPU backend in 1.31). It runs in a hidden Chromium window ([gpu-context.cjs](gpu-context.cjs.md)). Unlike the CPU pack it needs no `onnxruntime-common` next to it. Vectors of fp16 differ slightly from those of q8 (similarity about 0.994 on the same texts), which is why each pack is a different model in the index.

- `createSemanticPack({ directory, kind, fetchImpl, commonSource, files })`: `kind` is `'cpu'` (default) or `'gpu'`; `fetchImpl` is Electron's `net.fetch` in `main.cjs` (it follows the system proxy and certificates) and a fake in tests; `commonSource` is the folder of the `onnxruntime-common` package.
  - `install({ onProgress, signal })`: downloads every file to `<name>.part`, hashes while writing, renames when it matches, copies `onnxruntime-common` into `node_modules` and removes files that are not in the manifest (left by an older version of the pack) and writes `ready.json` last. A file already verified by an interrupted attempt is not downloaded again. One install at a time (a second call gets the same promise). Rejects, with the file name, on network error, wrong size or hash mismatch.
  - `ready`, `status()` returns `{ state: 'missing' | 'installing' | 'ready', received, total, file, totalBytes, error }`; `directory`; `remove()` (refused while installing).

Tests: [tests/semantic-pack.test.cjs](../../../tests/semantic-pack.test.cjs).

The copy of `onnxruntime-common` into the pack is done file by file (`copyTree`, with `readdirSync` and `copyFileSync`), not with `fs.cpSync`: in the installed app the package lives inside `app.asar`, and `cpSync` cannot read a folder from an asar (it failed with ENOENT "node_modules\onnxruntime-common not found in …app.asar").
