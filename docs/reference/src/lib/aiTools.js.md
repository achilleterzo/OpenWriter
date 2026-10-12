# aiTools.js

Source: [`src/lib/aiTools.js`](../../../src/lib/aiTools.js)

Renderer-side tool layer of the assistant: defines the tool catalog (`TOOL_DEFINITIONS`, grouped by `files`, `create`, `notes`, `memory`, `edit`, `web`, `vision`, `ask`), builds the tool prompts and function-calling schemas, parses tool calls, and executes them through `createToolRunner`.

Tools implemented here:

- Read: `list_directory`, `read_file` (open documents are read from the live editor, including unsaved changes; disk files through the project tools), `list_versions`, `read_version`.
- Create: `create_directory`, `create_file` (never overwrites; optional same-name allowance and `open` in a tab), `move_file`, `delete_file` (trash, with user confirmation dialog).
- Notes: `add_note` (single or batched up to 20; suggestions anchored to exact quotes through the anchoring helpers), `list_notes` (status filter, all-project option), `update_note` (assistant-authored notes only; re-anchoring after text edits; only open/resolved status changes — accepting and rejecting stay with the user).
- Memory: `remember`, `update_memory` and `forget` (assistant-authored entries only), `recall`.
- Edit: `open_document`, `replace_document` (full rewrite), `replace_text` (unique find, tolerates Markdown-escaped input), `insert_text` (after/before/start/end with anchor); every edit first snapshots the document into history ("Before the AI edit"), and results mention undo via Ctrl+Z.
- Web: `browser_tabs`, `browser_read`, `web_open` (http(s) only, private and local hosts blocked), `web_search` (DuckDuckGo HTML), `browser_navigate` (back/forward/reload), `browser_follow_link` (by number, text, or address), `web_read` (chunked page text; links and image lists cached per tab).
- Vision: `screenshot_document`, `screenshot_browser`, `view_image` (project file, URL, or page image number).
- Ask: `ask_choice` (single, `multiple`, or `ordered` choices; 2–60 options; page size 2–10; "Other" toggle; up to 8 sequential questions; tolerates options passed as strings).

Protocol utilities: `toolSchemas(enabled)` builds Ollama-style function-calling schemas filtered by the enabled groups. `toolsPrompt(enabled, options)` renders the plain-text protocol used by the CLI providers (the model answers by writing its call block as text), with per-group usage hints, untrusted-content rules, and the active document path; the `native` variant omits the block syntax when the provider already supports function calling; chaining is capped by `maxSteps` (default `DEFAULT_MAX_TOOL_STEPS` = 30, adjustable in Settings). `parseToolCall(reply)` extracts and validates the call with lenient JSON parsing (raw newlines inside strings, stray trailing characters) and a bare-JSON fallback. `visibleText(reply)` hides the call block while streaming, and `splitNextPrompt(reply)` separates the trailing suggestion line. `describeCall(name, args)` produces the short user-facing description of a running tool, and `relativeToProject` converts absolute paths to project-relative ones.