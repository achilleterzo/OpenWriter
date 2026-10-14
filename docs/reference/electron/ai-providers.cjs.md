# electron/ai-providers.cjs

Source: [`electron/ai-providers.cjs`](../../electron/ai-providers.cjs)

AI provider layer for five backends: Ollama, Ollama Cloud, OpenRouter, Codex CLI, and Claude CLI.

- Ollama talks to a local HTTP endpoint with NDJSON streaming.
- Ollama Cloud authenticates with an API key encrypted through `safeStorage` and stored in the Electron user data directory.
- OpenRouter uses its own encrypted key (`openrouter-key.bin`) and the OpenAI-compatible `/api/v1/chat/completions` endpoint with SSE streaming; native tool calls, images, PDF files (`type: 'file'` parts, with the `file-parser` plugin set to the `native` PDF engine) and reasoning effort are translated from the Ollama-style messages the renderer sends; requests ask for `usage: { include: true }`.
- Codex and Claude are spawned as CLI child processes, resolved on Windows through `where.exe` and known install roots, invoked through PowerShell quoting, and terminated as a process tree on cancel.
- CLI settings are normalized per provider, including reasoning-effort levels, and the `*_API_KEY` environment variables are removed from child processes so that an ambient key cannot silently switch the authentication mode.
- The prompt sent to a CLI instructs the model that it is not a coding agent and that OpenWriter tools must be requested by writing a fenced `<tool_call>…` block as plain text; the app parses that block and executes the requested tool, enabling multi-step tool chains up to the configured limit.
- `chatStream` messages may carry `files: [{ mime: 'application/pdf', name, data }]`. Only OpenRouter and Claude accept them: Claude receives them as `document` blocks of a stream-json message, with `[Document N: name]` placeholders in the prompt; the other providers throw. `getCapabilities` returns `{ known, vision, tools, pdf }` (`pdf`: Claude always, OpenRouter when the model accepts `file` input). `listModelInputs({ provider, endpoint })` returns `{ [id]: { vision, pdf } }` for every model of a provider (OpenRouter from the catalog, Ollama through one cached `/api/show` per model, six at a time), leaving out the models whose capabilities are unknown; it feeds the input filter of the model picker.
- Besides `text`, `thinking` and `status`, the stream emits `{ type: 'usage', input, output }` token counts: from Ollama's final `done` line, OpenRouter's `chunk.usage`, the Claude CLI `result` event (input includes cache creation and cache read tokens), and Codex's `turn.completed`.
- Settings are persisted in `ai-settings.json`, and diagnostic lines are appended to `ai-diagnostics.log`, truncated at 1 MB.