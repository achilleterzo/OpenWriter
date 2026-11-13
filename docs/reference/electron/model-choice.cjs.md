# electron/model-choice.cjs

Source: [`electron/model-choice.cjs`](../../../electron/model-choice.cjs)

The AI model chosen for a project or for a single conversation: `{ provider, model, reasoning, params }`. A project keeps it in its `project.json` (`ai.model`), a conversation in its own file (`selection`). It holds names only: API keys, endpoints and advanced parameters stay in the general settings, on the computer.

- `PROVIDERS`: the six providers (`ollama`, `ollama-cloud`, `openrouter`, `codex`, `claude`, `gemini`).
- `cleanModelChoice(value)`: `null` when there is no valid provider (no choice: the general settings apply), otherwise the choice with model and reasoning as plain text (no control characters, 200 and 30 characters at most).
- `applyModelChoice(settings, choice, { reasoningLevels, usable })`: the general settings with the choice on top, without touching the originals. An empty model keeps the general model of that provider, and a reasoning level the provider does not have is ignored. When `usable(provider)` says no (a provider with an API key that is not saved on this computer), the general settings are returned unchanged.
- `params`: the generation parameters the project can have of its own (`numPredict`, `numCtx`, `keepAlive`, Codex `sandbox`), cleaned within the same limits as the general ones; a key that is absent is inherited and an empty value means the model default. Keys, the endpoint and the CLI sign-in are not part of it.
- Used by [ai-providers.cjs](ai-providers.cjs.md) (`getEffectiveSettings`, `chatStream`), [project-file.cjs](project-file.cjs.md) and [chat-store.cjs](chat-store.cjs.md).
