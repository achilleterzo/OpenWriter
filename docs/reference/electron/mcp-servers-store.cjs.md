# electron/mcp-servers-store.cjs

Source: [`electron/mcp-servers-store.cjs`](../../../electron/mcp-servers-store.cjs)

The servers the assistant can connect to as an MCP **client** (the server side is [mcp-server.cjs](mcp-server.cjs.md)). Planning and status: [docs/planned/mcp-client.md](../../planned/mcp-client.md).

Where things are kept:

- global servers: `mcp-servers.json` in the app data, on the computer;
- servers of a project, and which global ones it uses: `<project>/.ow/mcp.json` (`{ servers, use }`), configuration only, never credentials;
- credentials (environment variables of a program, headers of a web address): one blob per server, encrypted with `safeStorage`, in `mcp-secrets.json`, tied to the server id. A project copied to another computer therefore still opens, and its servers show as "credentials missing";
- trust: `mcp-trust.json`, outside the project: for each project and server, the hash of what the user confirmed.

`createMcpServersStore({ directory, secrets, getChain })` (`secrets`: `available`, `encrypt`, `decrypt`; `getChain(project)`: the folders of the projects that apply, outermost first):

- `list(project)`: `{ global, project, use, secureStorage }`. Each server has `scope`, `trusted`, `missingCredentials` (and `origin`, `inherited` for project ones).
- `save({ project, server, credentials })`: cleans the configuration (type `stdio` or `http`, a command or an `http(s)` address, credential names, `alwaysAsk`, `enabledTools`), refuses a name already used, and stores the credential values (`{ env | headers: { NAME: value } }`; a value sets it, `null` removes it, leaving it out keeps it). Names that are no longer listed lose their value. An `http` server can use OAuth (`auth: 'oauth'`, `clientId`, `scopes` in the configuration; `credentials.oauth.clientSecret` and the tokens, encrypted): with no refresh token it counts as "credentials missing", `getOauth(id)` / `setOauth(id, patch | null)` read and write the tokens (`null` signs out and keeps the client secret), and a different client ID drops the old tokens. See [mcp-oauth.cjs](mcp-oauth.cjs.md).
- `remove`, `setUse(project, ids)` (only global ids that exist), `trust(project, id)`.
- `active(project)`: the servers in use — the global ones the project (or an enclosing one) uses, plus every project server, the nearest winning on a name clash — each with its `state` (`ready`, `untrusted`, `missing-credentials`), a `key` (`g:id` / `p:id`), a `hash` and, only when ready, the credentials. `resolve(project, id)` gives one server whether it is used or not, for testing it.
- `launchHash(server)`: sha256 of type, command, arguments, address, credential names, and the OAuth settings (client ID and scopes). Changing any of them removes the trust of a project server; changing "ask every time" or the tools that are on does not.

A server defined by a project is code that runs with the user's permissions, so it never starts before the user confirms it in the project settings, with the command or address shown in full.
