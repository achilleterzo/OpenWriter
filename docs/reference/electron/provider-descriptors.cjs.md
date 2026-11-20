# electron/provider-descriptors.cjs

Source: [`electron/provider-descriptors.cjs`](../../../electron/provider-descriptors.cjs)

The services that speak the `openai-chat` protocol, as data. `OPENAI_DESCRIPTORS` has one block per provider (today `openrouter` and `gemini`); adding a compatible service means adding a block, with no code.

- `protocol`: the codec that talks to the service ([openai-chat.cjs](openai-chat.cjs.md)).
- `label`, `baseUrl`, `headers`: name shown in messages, API root and fixed headers (OpenRouter sends `X-Title: OpenWriter`).
- `reasoningParam`: dotted path of the request body that receives the reasoning level (`reasoning.effort` for OpenRouter, `reasoning_effort` for Gemini); absent when the service takes none.
- `usage`: body fragment that asks for the token counts in the stream (`usage.include` or `stream_options.include_usage`).
- `whenFiles`: body fragment added only when the request carries PDFs (OpenRouter's native `file-parser` plugin); absent when the service does not read them.
- `models`: `{ catalog: true }` for a public catalog whose entries carry each model's inputs, or `stripPrefix`, `include`, `exclude` (regular expressions as text) that clean the ids of `/models`.
- `capabilities`: `'catalog'` (read from the catalog entry) or `{ vision, tools, pdf }` valid for every model of the service.
- `OPENAI_PRESETS`: the choices of the `openai` provider ("OpenAI-compatible"): `lmstudio` (default), `llamacpp`, `vllm`, `openai`, `groq`, `together`, `mistral`, `deepseek` and `custom` (free address). Each has `label`, `baseUrl`, `keyRequired` (local servers and `custom` take an optional token, hosted services require it) and, for OpenAI and Groq, `reasoningParam` (`reasoning_effort`). `presetDescriptor(preset, baseUrl, name)` returns the full descriptor of a preset with the chosen address and, as `label`, the name the user gave (the preset's own when empty); its capabilities are `'manual'` (declared by the user, or asked to the server when it is Ollama: a generic server does not say whether a model sees images or uses tools).
- `isCompatibleProvider(id)` and `MAX_COMPATIBLE_PROVIDERS` (20): a compatible server is a provider of its own. The first has id `openai`, the others `openai-<code>` (`/^openai(?:-[a-z0-9]{4,12})?$/`); each has its own name, preset, address, key, capabilities and icon, and counts as a provider everywhere (project choice, conversation, research assistant).
- `createAiProviders` accepts a `descriptors` option (default `OPENAI_DESCRIPTORS`), used by the tests to point the services to a local fake server.
