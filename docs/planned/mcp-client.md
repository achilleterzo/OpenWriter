# MCP client

Status: **first version implemented on 2026-11-13** (stdio and HTTP servers, global and per project, trust on first run, confirmation before writes). Checked with a fake stdio server in the unit tests, **not yet tried in the live app** with a real service such as the WordPress adapter. Agreed in conversation on 2026-11-09; revised on 2026-11-12 (servers also per project, trust on first run, several windows).

## Goal

Let the assistant use external services exposed through MCP servers (for example Google Docs), so it can work on documents that live in the cloud and not only on the project files. Google Docs is just the first example: the client must be generic.

OpenWriter already has an MCP **server** (`electron/mcp-server.cjs`, hand-written, no SDK). This adds the **client** side.

## Decisions


| Topic          | Choice                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------- |
| Implementation | Official SDK `@modelcontextprotocol/sdk` (stdio and HTTP transports, OAuth client for later). |
| Scope          | Servers are **global** (each project chooses which ones to use) or **of a project** (defined in its `.ow`). |
| Project servers | Configuration in `.ow`, secrets never there. A sub-project inherits those of its parents; on a name clash the nearest project wins. |
| Trust          | A server defined by a project (so one that arrives with a copied or cloned project) never starts before the user confirms it, showing the full command or address; a new confirmation is asked whenever it changes. |
| Confirmation   | Ask before a call when the tool is not declared read-only (`readOnlyHint`), and always when the server is set to "ask every time" (the default for a tool that declares nothing). |
| First version  | stdio and HTTP (Streamable HTTP) servers with a token or key, or with OAuth sign-in (the user's own OAuth client). The older SSE transport comes later. |
| Where it lives | Settings → Services (global) and the project settings → Services tab; the tools reach the model as `service__tool`, through the same text protocol or native tool calls as the app's own tools. |


## How it is today

- Assistant tools are a static list, `TOOL_DEFINITIONS` in `src/lib/aiTools.js`, split in groups (`files`, `web`, `notes`, …). Each group is switched on in the settings; `web` is opt-in because it sends data out.
- `createToolRunner` (renderer) runs them, going through the `tools:*` IPC channels to the main process.
- Provider keys are encrypted with `safeStorage` (`electron/ai-providers.cjs`). Service tokens will use the same approach.

## Phase 1: client and configuration

- [x] Add the `@modelcontextprotocol/sdk` dependency (`dependencies`, so `electron-builder` packs it with the rest of `node_modules`; a packaged build has still to be tried).
- [x] [`electron/mcp-client.cjs`](../reference/electron/mcp-client.cjs.md): connects to stdio (child process, with the stored credentials as environment variables) and HTTP servers (credentials as headers), starts them lazily on first use, one connection per server reused while its configuration does not change, `listTools`, `callTool` with a timeout (60 s; 20 s to connect or list), `closeAll` on quit. A server that does not start gives an error with the last lines it wrote on stderr.
- [x] [`electron/mcp-servers-store.cjs`](../reference/electron/mcp-servers-store.cjs.md): global servers in the app data (`mcp-servers.json`), the servers of a project and the global ones it uses in `<project>/.ow/mcp.json`, inherited from the enclosing projects (the nearest wins on a name clash). Environment variables and headers are encrypted with `safeStorage` (`mcp-secrets.json`), tied to the server id: the `.ow` of a project holds the configuration of a server, never its credentials.
- [x] Trust of project servers: the store keeps, outside the project (`mcp-trust.json`), the hash of what starts the server (type, command, arguments, address, names of the credentials) that the user confirmed for that project and server; a server whose hash does not match is not started. Changing only "ask every time" or the tools that are on does not ask again.
- [x] IPC channels in `electron/main.cjs` and `window.electronAPI.mcp`: `mcp:list`, `mcp:save-server`, `mcp:remove-server`, `mcp:set-use`, `mcp:trust-server`, `mcp:test-server`, `mcp:tools`, `mcp:call-tool`.
- [~] Several windows: a project is open in one window only, so its own servers cannot clash between windows; the global ones are started by each window (process) that uses them. Servers that cannot be shared (a single access at a time) are still an open point.

## Phase 2: the assistant uses them

- [x] The tools of the connected servers are offered to the model as `service__tool` (the service name reduced to letters and digits, at most 64 characters in all), with the server's JSON schema passed as it is to the providers with native tool calls (a schema over 6000 characters is replaced by a plain object), and described in the text of the prompt for the others. They are not a group of `TOOL_DEFINITIONS` (the list is dynamic): `toolSchemas` and `toolsPrompt` take `mcpTools`, and the chat asks `mcp:tools` at each request. A service that is switched on but cannot be used (not confirmed, credentials missing, it fails to start) is named in the prompt, so the model tells the user instead of inventing.
- [x] `createToolRunner` routes those names to `callMcp` and puts in front of every result a warning that the content is untrusted, like `WEB_WARNING` for browsing.
- [x] Confirmation before a call when the tool is not declared read-only (`readOnlyHint`), and always when the server is set to "ask every time": a native dialog of the main process (so the renderer cannot skip it) with service, tool and the arguments in full, which is what shows which ability a gateway server (such as the WordPress adapter) is about to run. A refusal reaches the model as an error that says not to insist.
- [ ] A queued task (see the assistant's queue) that reaches a tool needing confirmation stops there and says so in its pill, instead of waiting for a dialog nobody is looking at. Today the dialog just waits.
- [x] Limits: at most 30 tools per server, only the ones the user switched on (none at the start), results cut at 20000 characters.

## Phase 3: interface

- [x] Settings → Services ([ServicesSettings.jsx](../reference/src/components/pages/ServicesSettings.jsx.md)): add or edit a server (program or web address, arguments, credentials, "ask every time"), test it, list its tools, switch each one on or off, remove it. Changes are saved at once (the credentials are not part of any project).
- [x] The project settings have a Services tab: which global services the project uses (switch) and the services of the project itself (add, edit, remove, inherited ones shown read-only). The trust confirmation shows the command or the address in full, with a warning, and the Test button stays hidden until it is given.
- [ ] Import the services from another project, like the quick actions.
- [x] Texts in the five languages (it, de, pt, es, fr).
- [x] Unit tests in `tests/mcp-client.test.cjs`: store, inheritance and name clash, trust hash, missing credentials, encrypted secrets, routing, confirmation logic, limits, the credential reaching the process, a server that fails; run against a fake stdio server (`tests/fixtures/fake-mcp-server.cjs`). The renderer side (prompt and schemas in `aiTools.js`) has no automated test yet.

## After the first version

- [ ] **SSE transport** for the older HTTP servers (only Streamable HTTP now).
- [x] **OAuth** for services that need a browser login (2026-11-13, for Google Docs among others): [`electron/mcp-oauth.cjs`](../reference/electron/mcp-oauth.cjs.md) discovers the endpoints, signs in with PKCE through the browser and a local `127.0.0.1` redirect, and renews the token; the user brings their own OAuth client (Google has no automatic registration), secret and tokens are encrypted. Tested against a fake provider; **not tried with Google yet**. Still missing: automatic client registration (RFC 7591) for services that offer it.
- [ ] **"Import as reference"**: save a cloud document under `.ow` like `save_web_reference` does, so `search_knowledge` can search it.
- [ ] **MCP resources and prompts**, besides tools.

## Checks before calling it done

- [ ] A stdio server starts on first use (tested) and its process is gone when the app quits (the app closes the connections on `before-quit`; no orphans on Windows still to be checked by hand).
- [x] A server that crashes or times out gives the assistant a clear error and does not block the conversation (tested for a server that exits at once; the others still work).
- [~] Tokens never appear in logs, in `ai-diagnostics.log` or in the project files; they are stored encrypted (tested for the project file and the secrets file; nothing is logged but the connection key; the last stderr lines of a server that fails to start are shown in the error, so they could include what the server printed).
- [x] A write tool without `readOnlyHint` always asks; a read-only one does not (tested).
- [~] Tool results are marked as untrusted and the prompt says to treat them as data (done; how well a model obeys it is not tested).
- [x] With the server switched off for a project, its tools are not offered to the model (tested: only used servers and switched-on tools are offered).
- [x] A server defined in a project that was just copied or cloned does not start until confirmed, and asks again if its command or address changes (tested).
- [x] A project copied without its credentials still opens: the server shows as "missing credentials" and does not start (tested).
- [~] A server with many tools does not overflow the context (the allow-list is tested; the limit of 30 tools and the size cap of schemas are in the code, not tested).
- [ ] Works with a provider with native tool calls and with one without (both paths are written; neither tried with a real model).
- [x] Checked what the CLI providers (Claude, Codex) see (2026-11-13): the app's tools reach them only as text in the prompt (`<tool_call>` blocks that the app runs), so MCP client tools can use the same path, with its lower reliability. Codex already ignores the user's configuration (`--ignore-user-config`, no shell, apps or browser). Claude used to inherit the user's MCP servers, skills and slash commands (on a machine where Claude is connected to the OpenWriter MCP server, the model could have called it directly, skipping the app's confirmations): it now starts with `--strict-mcp-config` and an empty MCP config file, and `--disable-slash-commands` (`claudeIsolationArgs`, tested in `tests/ai-providers.test.cjs`; the start event shows no MCP servers, skills or commands). `--bare` is not an option: it drops the OAuth login.
- [x] Lint, unit tests and the build pass (2026-11-13).
- [ ] Tried in the live app with a real service (the WordPress adapter over stdio and over HTTP).

## Risks and open points

- **Security.** A stdio server runs code with the user's permissions: say it clearly when one is added. Content read from the cloud is a prompt-injection channel, which is why writes ask for confirmation.
- **CLI providers (Claude, Codex)** bring their own tools, and they must not see the user's own MCP servers (see the check above). The MCP client tools reach them through the text protocol of the prompt, like the other tools of the app, never as native tools of the CLI.
- **First server to try.** Google Docs was only an example. A good test bench is the [WordPress MCP adapter](https://github.com/WordPress/mcp-adapter): it works over HTTP on the site or over stdio with WP-CLI, so it covers both transports, and it fits a project (one site, one project). It exposes three generic tools (`discover-abilities`, `get-ability-info`, `execute-ability`), which is why the confirmation shows the arguments. Its authentication still has to be read in its own guide. A server that needs OAuth waits for the later version.
- **Project servers are code.** A stdio server is a command run with the user's permissions, and a project can bring it along: the confirmation on the first run, with the full command, is what keeps opening someone else's project from running something unseen.

