# ProviderCards.jsx

Source: [`src/components/ProviderCards.jsx`](../../../../../src/components/ProviderCards.jsx)

The AI providers to choose from, as a grid of cards with their logos. The same cards serve the general choice and the choice of a project (the two forms of [AiProviderSettings.jsx](AiProviderSettings.jsx.md), which uses them with `value` and `onChange`).

- `providers` (exported) is the list `[{ value, label, description }]`: `ollama` (Ollama, local HTTP service), `ollama-cloud` (hosted API with an API key), `openrouter` (hundreds of models with one API key), `codex` (native CLI with ChatGPT OAuth), `claude` (native CLI with Claude OAuth) and `gemini` (Google AI Studio API key). The labels are not translated, the descriptions are.
- `logos` (exported) maps each value to its SVG in `src/assets/provider-logos/`; Ollama Cloud reuses the Ollama logo.
- The component is a `radiogroup` labelled "AI provider": one button per provider, `role="radio"` with `aria-checked`, two columns from the `sm` breakpoint. The chosen card gets the teal border and tint; the others stay grey and light up on hover. Each card shows the logo on a light rounded square (decorative, `aria-hidden`), the name in bold and the description in small type, both truncated.
- `onChange(value)` is called with the provider of the card clicked; the component holds no state.

`AiProviderSettings` also uses `providers` on its own, to fill the selector of the research model, filtered to the providers with native tool calls (`RESEARCH_PROVIDERS`).
