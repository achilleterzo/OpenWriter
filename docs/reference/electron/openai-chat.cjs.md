# electron/openai-chat.cjs

Source: [`electron/openai-chat.cjs`](../../../electron/openai-chat.cjs)

Codec of the `openai-chat` protocol (`POST {baseUrl}/chat/completions` answered as a server-sent-events stream). Pure functions, no Electron and no provider names: what differs between services is data in [provider-descriptors.cjs](provider-descriptors.cjs.md), and the oddities of the answers are reading rules valid for every service.

- `buildRequest(descriptor, { model, messages, temperature, numPredict, level })`: `{ body, reasoning }`. `body` has the model, the messages, `temperature` and `max_tokens` when set, the descriptor's `usage` fragment and, only when a message carries a PDF part, its `whenFiles` fragment. `reasoning` is kept apart (the level written at the descriptor's `reasoningParam` path, empty for "default") so that a request the model rejects with 400 can be repeated without it.
- `requestHeaders(descriptor, key)`: `Accept`, the Bearer token when there is one, and the descriptor's fixed headers.
- `toOpenAiMessages(list)`: converts the Ollama-style messages the renderer sends: every tool call gets an id that the following tool result repeats (an orphan result becomes a user message), images become `image_url` data URIs and PDFs `file` parts.
- `createStreamParser({ onEvent, onError })`: `push(chunk)` per JSON object, `finish()` at the end. It emits `text` (`delta.content`), `thinking` (`delta.reasoning`) and `usage` events, rebuilds the tool call from its fragments (one call per message: a second function name, or an index other than 0, is ignored) and appends it as a `<tool_call>` block, as the other providers do. An `error` object inside the stream throws an error marked `fatal` and `streamError`. `emitted` tells whether any text or reasoning has already been shown.
- `isTransient(error)`, `TRANSIENT_STATUSES`, `RETRY_DELAYS_MS`: an in-stream error or an HTTP 408/429/5xx is retried after 1.5 s and then 4 s, only while nothing has been shown yet.
- `parseModelIds(descriptor, data)`: the ids of a `/models` answer, cleaned by the descriptor's `stripPrefix`, `include` and `exclude` rules.
- `setPath(target, path, value)`: sets a value at a dotted path.
- Used by [ai-providers.cjs](ai-providers.cjs.md) (`streamOpenAi`, model lists).
