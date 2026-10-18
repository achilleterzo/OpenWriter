# electron/mcp-server.cjs

Source: [`electron/mcp-server.cjs`](../../electron/mcp-server.cjs)

OpenWriter as an MCP server on stdio: it gives external agents (Claude Code, Codex, OpenCode, clients built into IDEs) what the files alone do not show — the project context and instructions, skills, notes, bookmarks and memory — together with listing, reading and searching the documents. It never edits a document's text, but it can add notes, suggested replacements and bookmarks, which the user reviews in OpenWriter and accepts or rejects. With `--read-only` those tools do not exist. It does not depend on Electron, so it also works with the application closed.

It is a standalone script: JSON-RPC 2.0, one message per line on stdin/stdout, diagnostics on stderr. The protocol versions it accepts are listed in `SUPPORTED_PROTOCOLS`, answering `initialize`, `ping`, `tools/list` and `tools/call`; a tool error comes back as a result flagged `isError`, so the agent can read it and correct itself.

The project, in order: `--project <folder>` (or `OPENWRITER_PROJECT`); the nearest `.ow` found walking up from the folder the agent starts in; the project open in the application (`workspace.json` in the app data). `--data <folder>` points to the application data. Besides the project itself, the server reads the session saved by the app (`sessions.json`) to know which document the user has in front, so the tools that take a `document` can default to it.

Read tools: `project_info`, `get_context`, `list_skills`, `get_skill`, `read_project` (the whole tree in one call, with depth and entry limits), `list_documents`, `read_document` (in chunks), `search_documents`, `list_notes`, `list_bookmarks`, `list_memory`.

Write tools (`WRITE_TOOLS`, absent with `--read-only`): `add_note` (a remark, or a suggestion when a `replacement` is given), `suggest_insertion`, `update_note`, `add_bookmark`, `update_bookmark`. Quotations must be plain words, unique and within one paragraph or heading: the server reduces them to the plain text of [markdown-plain.cjs](markdown-plain.cjs.md) and anchors them, failing with a clear message when the passage is not found or appears more than once.
