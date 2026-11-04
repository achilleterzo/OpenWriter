---

# electron/semantic-embedder.cjs

Source: [`electron/semantic-embedder.cjs`](../../../electron/semantic-embedder.cjs)

Turns texts into vectors that represent their meaning (embeddings), with the model of the semantic pack ([semantic-pack.cjs](semantic-pack.cjs.md)): multilingual-e5-small, 384 numbers per text. It runs in the index worker ([knowledge-worker.cjs](knowledge-worker.cjs.md)) on WebAssembly (`onnxruntime-web`, Node build, up to 4 threads): the computation happens in the runtime's own threads, so the worker stays free between batches. In Node `fetch` does not read `file://`, so the WebAssembly is passed in memory and only the thread bootstrap module is given by URL.

`createEmbedder({ directory, threads })` returns `{ dimensions, embed(texts, kind), close() }`. `kind` is `'passage'` (what is indexed) or `'query'` (what is searched): E5 needs the prefixes `passage: ` / `query: `. Texts over 512 tokens are cut keeping the end symbol. The vectors are mean-pooled over the real tokens and normalized to length 1, so the similarity of two texts is their dot product. About 70 ms per passage of ~100 words with 4 threads (native onnxruntime is roughly twice as fast, but would need a native library per platform).

Tested with the real model in [tests/semantic-search.test.cjs](../../../tests/semantic-search.test.cjs) (runs only if `OW_SEMANTIC_PACK` points to an installed pack).
