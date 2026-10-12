# aiOptions.js

Source: [`src/lib/aiOptions.js`](../../../src/lib/aiOptions.js)

Reasoning ("effort") levels offered per provider in the renderer settings, exported as `reasoningByProvider`:

- `ollama` and `ollama-cloud`: instant (default), low, medium, high.
- `codex`: client default (first) plus low, medium, high, and very high (`xhigh`).
- `claude`: client default plus low, medium, high, very high (`xhigh`), and maximum (`max`) — the only provider with `max`.

