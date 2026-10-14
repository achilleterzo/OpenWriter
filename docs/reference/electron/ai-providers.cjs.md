# electron/ai-providers.cjs

Source: [`electron/ai-providers.cjs`](../../electron/ai-providers.cjs)

AI provider layer for five backends: Ollama, Ollama Cloud, OpenRouter, Codex CLI, and Claude CLI.

- Ollama talks to a local HTTP endpoint with NDJSON streaming.
- Ollama Cloud authenticates with an API key encrypted through `safeStorage` and stored in the Electron user data directory.
- OpenRouter uses its own encrypted key (`openrouter-key.bin`) and the OpenAI-compatible `/api/v1/chat/completions` endpoint with SSE streaming; native tool calls, images and reasoning effort are translated from the Ollama-style messages the renderer sends.
- Codex and Claude are spawned as CLI child processes, resolved on Windows through `where.exe` and known install roots, invoked through PowerShell quoting, and terminated as a process tree on cancel.
- CLI settings are normalized per provider, including reasoning-effort levels, and the `*_API_KEY` environment variables are removed from child processes so that an ambient key cannot silently switch the authentication mode.
- The prompt sent to a CLI instructs the model that it is not a coding agent and that OpenWriter tools must be requested by writing a fenced `<tool_call>…` block as plain text; the app parses that block and executes the requested tool, enabling multi-step tool chains up to the configured limit.
- Settings are persisted in `ai-settings.json`, and diagnostic lines are appended to `ai-diagnostics.log`, truncated at 1 MB.