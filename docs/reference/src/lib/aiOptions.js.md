# aiOptions.js

Source: [`src/lib/aiOptions.js`](../../../../src/lib/aiOptions.js)

The options of the AI providers shared between the components.

- `reasoningByProvider`: the reasoning ("effort") levels offered per provider in the renderer settings:
  - `ollama` and `ollama-cloud`: instant (default), low, medium, high.
  - `openrouter` and `gemini`: client default (first) plus low, medium, high.
  - `codex`: client default plus low, medium, high, and very high (`xhigh`).
  - `claude`: client default plus low, medium, high, very high (`xhigh`), and maximum (`max`) — the only provider with `max`.
- `toolLabels()`: the name under which each group of tools appears in the AI settings (`files`, `create`, `memory`, `notes`, `edit`, `ask`, `vision`, `web`). It is a function, not a constant, so the labels follow the interface language after a change.

