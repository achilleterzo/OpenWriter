---

# electron/gpu-context.cjs

Source: [`electron/gpu-context.cjs`](../../../electron/gpu-context.cjs)

The context that computes the vectors on the graphics card. WebGPU only exists inside Chromium, not in Node threads, so the GPU pack ([semantic-pack.cjs](semantic-pack.cjs.md)) runs in a **hidden window** (`electron/gpu-embedder/`: `index.html`, `page.mjs`, `preload.cjs`) that loads the fp16 model with `onnxruntime-web` (WebGPU backend). The main process sends it texts and receives vectors; the index worker asks the main process (see [knowledge-service.cjs](knowledge-service.cjs.md)).

`createGpuContext({ BrowserWindow, ipcMain, packDirectory, tokenizersFile, idleMs })` returns:
- `probe()`: which adapter WebGPU would use (`{ webgpu, vendor, architecture, device, description, fp16 }`, or `{ webgpu: false, reason }`), without loading the model.
- `embed(texts, kind)`: normalized `Float32Array` vectors (`kind` `'passage'` or `'query'`); loads the model at the first call.
- `release()`: closes the window and frees the card's memory (it is created again at the next request; it also closes by itself after `idleMs`, 2 minutes, without work and never while a request is pending); `close()` also stops the server.

The page, the tokenizer library and the pack files are served by a tiny HTTP server on the loopback address only, with a secret path per start (ES modules and loading a 235 MB model do not work well from `file://`); only the names of the pack files are served. The window has no Node, cannot open windows or navigate, has no permissions and a Content-Security-Policy that admits only what it needs; only replies from its own `webContents` are accepted. Requests time out after 3 minutes, and if the page crashes the pending requests fail, so the caller can fall back to the CPU.

The page (`page.mjs`) cuts the text to 4,000 characters before tokenizing, like the CPU embedder (a 130,000-character passage made the GPU fail with `Maximum call stack size exceeded`). It does what [semantic-embedder.cjs](semantic-embedder.cjs.md) does (E5 prefixes, tokenizer, mean over the real tokens, normalization) with the fp16 model; fp16 outputs are converted to float32. Measured on an RTX 5070: about 12 to 16 ms for a passage of 250 words (against about 290 ms on the CPU), and 246 passages in under 6 seconds including the window and the model load.
