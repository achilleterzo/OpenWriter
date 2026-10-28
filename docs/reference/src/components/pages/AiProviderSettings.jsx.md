---

# AiProviderSettings.jsx

Source: [`src/components/AiProviderSettings.jsx`](../../../../../src/components/AiProviderSettings.jsx)

Settings screen section for the AI assistant: an enable switch and the choice among Ollama (local HTTP service), Ollama Cloud (hosted API with an API key), OpenRouter (hundreds of models with one API key), Codex (CLI with ChatGPT OAuth), Claude (CLI with Claude OAuth), and Gemini (Google AI Studio API key), each with its logo and a one-line description.

For the chosen provider it shows: endpoint and model (through [ModelPicker.jsx](ModelPicker.jsx.md), which filters by accepted input) and connection for Ollama; the API key field for Ollama Cloud, OpenRouter, and Gemini, with the "(saved)" flag, the link to create a key and the button that saves or removes it from the encrypted storage; the sign-in state, the Check button and the OAuth flow for the CLI providers, including the authorization code to paste and the link to reopen the browser. The remaining settings are the reasoning effort (from [aiOptions.js](../../lib/aiOptions.js.md)), the reasoning of the steps that follow a tool result (`toolReasoning`: as configured, reduced to "low" — the default — or off), the assistant language, the generation parameters ([ParameterSlider.jsx](ParameterSlider.jsx.md): temperature, context and predicted tokens, keep-alive; the Codex sandbox for Codex), the tool-chain limit, and the toggles of the assistant tool groups (files, creating files, memory, notes, editing the open document, questions, images and screenshots, web browsing), each with an explanation.

A **Research assistant** fieldset turns on the second model the assistant delegates explorations to ([researchAgent.js](../../lib/researchAgent.js.md)): a switch with an explanation (it searches and reads the project files on its own, never changes anything, and returns a short report), then its provider — only the ones with native tool calls (`RESEARCH_PROVIDERS`: Ollama, Ollama Cloud, OpenRouter, Gemini) — its model, chosen with [ModelPicker.jsx](ModelPicker.jsx.md) and its own list of models, and its step limit (4–30).

Images and screenshots are enabled only when the chosen model can read images: the component asks for the provider capabilities and warns when they are missing. Saving the settings goes through the AI settings IPC, and errors are shown in the section.