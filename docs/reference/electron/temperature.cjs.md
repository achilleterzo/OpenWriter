# electron/temperature.cjs

Source: [`electron/temperature.cjs`](../../../electron/temperature.cjs)

The temperature of a project and of a conversation, as a level from 0 to 1 that means the same for every provider. Each provider converts it into its own range (level × maximum), and the bands and the maxima must stay aligned with [src/lib/temperature.js](../../src/lib/temperature.js.md). An empty value (`''`) means "no choice": the highest level wins (conversation, then project) and, when neither has one, the general temperature of the provider applies (which stays in its own degrees, empty meaning the model default).

- `PROVIDER_MAX`: the highest temperature each provider accepts — `ollama: 4`, `ollama-cloud: 2`, `openrouter: 2`, `gemini: 2`. The CLIs (Claude, Codex) have no such range: the level reaches them as a style instruction.
- `cleanTemperature(value)`: `''` for an empty, null or non-numeric value, otherwise the number clamped to `LEVEL_MIN`–`LEVEL_MAX` (0–1) and rounded to two decimals.
- `nativeTemperature(provider, level)`: the level in the degrees of the provider — `level × PROVIDER_MAX[provider]`, rounded to two decimals — or `''` when the provider has no range or there is no level.
- `styleHint(level)`: the extreme bands are rendered as a style instruction for the prompt. Below `LOW_LIMIT` (0.2) it returns `STYLE_LOW` (maximum precision, stay close to the source, no unrequested variation); at or above `HIGH_LIMIT` (0.8) it returns `STYLE_HIGH` (more freedom and variety, creative risk when the task allows it, never at the cost of facts or of the instructions); in between, or without a level, it returns `''`. Both instructions say they concern only the prose, never the format of tool calls.
- Exposed: `PROVIDER_MAX`, `cleanTemperature`, `nativeTemperature`, `styleHint`. It is used by [ai-providers.cjs](ai-providers.cjs.md) when a request is prepared.
