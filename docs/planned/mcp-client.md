# MCP client (planned)

Status: planned, not started. Agreed in conversation on 2026-11-09.

## Goal

Let the assistant use external services exposed through MCP servers (for example Google Docs), so it can work on documents that live in the cloud and not only on the project files. Google Docs is just the first example: the client must be generic.

OpenWriter already has an MCP **server** (`electron/mcp-server.cjs`, hand-written, no SDK). This adds the **client** side.

## Decisions


| Topic          | Choice                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------- |
| Implementation | Official SDK `@modelcontextprotocol/sdk` (stdio and HTTP transports, OAuth client for later). |
| Scope          | Servers are **global**; each project chooses which ones to use.                               |
| Confirmation   | Ask before a call only when the tool is not declared read-only (`readOnlyHint`).              |
| First version  | stdio and HTTP servers with a token or key. OAuth (browser login) comes later.                |


## How it is today

- Assistant tools are a static list, `TOOL_DEFINITIONS` in `src/lib/aiTools.js`, split in groups (`files`, `web`, `notes`, …). Each group is switched on in the settings; `web` is opt-in because it sends data out.
- `createToolRunner` (renderer) runs them, going through the `tools:*` IPC channels to the main process.
- Provider keys are encrypted with `safeStorage` (`electron/ai-providers.cjs`). Service tokens will use the same approach.

## Phase 1: client and configuration

- [ ] Add the `@modelcontextprotocol/sdk` dependency and check that `electron-builder` packages it.
- [ ] `electron/mcp-client.cjs` (new): connects to stdio (child process) and HTTP servers, starts them lazily on first use, exposes `listTools(serverId)`, `callTool(serverId, name, args)` and `close()`, and stops the child processes when the app quits.
- [ ] `electron/mcp-servers-store.cjs` (new): global list of servers (name, type, command or URL, environment variables), tokens encrypted with `safeStorage`, and per project the list of servers in use (stored in `.ow`).
- [ ] IPC channels in `electron/main.cjs`: `mcp:list-servers`, `mcp:save-server`, `mcp:test-server`, `mcp:call-tool`.

## Phase 2: the assistant uses them

- [ ] `src/lib/aiTools.js`: new group `mcp`. Tools of the connected servers are added to `toolSchemas` as `server__tool`, passing the server's JSON schema as it is (today `parameters` is a simplified form). For models without native tool calls, `toolsPrompt` describes them in the text.
- [ ] `createToolRunner` routes the prefixed names to the client and wraps every result with a warning that the content is untrusted, like `WEB_WARNING` for browsing.
- [ ] Confirmation only for tools that are not read-only, using the dialog already used by `delete_file`.
- [ ] Limits: a maximum number of tools per server and a list of allowed tools, so the context is not filled by a server with many tools.

## Phase 3: interface

- [ ] Settings page: add a server, test the connection, list its tools, switch each one on or off.
- [ ] Per-project switch for the servers.
- [ ] Texts in the five languages (it, de, pt, es, fr).
- [ ] Unit tests in `tests/*.test.cjs` (store, routing, confirmation logic) with a fake server.

## After the first version

- [ ] **OAuth** for services that need a browser login (the SDK supports it; needs a window or `shell.openExternal` and a local redirect).
- [ ] **"Import as reference"**: save a cloud document under `.ow` like `save_web_reference` does, so `search_knowledge` can search it.
- [ ] **MCP resources and prompts**, besides tools.

## Checks before calling it done

- [ ] A stdio server starts on first use and its process is gone when the app quits (no orphans on Windows).
- [ ] A server that crashes or times out gives the assistant a clear error and does not block the conversation.
- [ ] Tokens never appear in logs, in `ai-diagnostics.log` or in the project files; they are stored encrypted.
- [ ] A write tool without `readOnlyHint` always asks; a read-only one does not.
- [ ] Tool results are marked as untrusted and instructions inside them are not followed.
- [ ] With the server switched off for a project, its tools are not offered to the model.
- [ ] A server with many tools does not overflow the context (limit and allow-list work).
- [ ] Works with a provider with native tool calls and with one without.
- [ ] Checked what the CLI providers (Claude, Codex) see.
- [ ] Lint, unit tests and the build pass.

## Risks and open points

- **Security.** A stdio server runs code with the user's permissions: say it clearly when one is added. Content read from the cloud is a prompt-injection channel, which is why writes ask for confirmation.
- **CLI providers (Claude, Codex)** bring their own tools. Check at the start of phase 2 whether the app's MCP tools reach them or only the providers with native tool calls.
- **Google Docs in the first version.** Without OAuth it only works with a server that accepts a token. Choose which server to try first.

