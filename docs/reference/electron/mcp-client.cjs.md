# electron/mcp-client.cjs

Source: [`electron/mcp-client.cjs`](../../../electron/mcp-client.cjs)

The MCP client proper, on the official `@modelcontextprotocol/sdk` (loaded at the first connection). It knows nothing about projects or trust: it receives a ready server (see `active` in [mcp-servers-store.cjs](mcp-servers-store.cjs.md)) and uses it.

`createMcpClient({ log })`:

- connects to a **stdio** server (a child process, with the default environment plus the stored variables) or to a **Streamable HTTP** server (stored headers on every request, or, for an OAuth service, the `Authorization` header that `entry.getHeaders()` gives at each request, so a renewed token is used without reconnecting); the older SSE transport is not supported yet;
- one connection per server key, opened on first use, reused while the server hash does not change and reopened when it does; two requests at the same time wait for the same start;
- `listTools(entry)`: all the pages of `tools/list` as `{ name, description, inputSchema, readOnly }`, `readOnly` coming from the `readOnlyHint` annotation that the server declares;
- `callTool(entry, name, args, { timeoutMs })`: `{ text, isError }`; the text of the answer (other kinds of content are only named, an embedded text resource is read). Calls time out after 60 s, connecting after 20 s; a connection that failed at transport level is dropped and reopens on the next call;
- a server that does not start gives an error that ends with the last lines it wrote on stderr;
- `closeAll()` closes every connection (and so the child processes); the app calls it on `before-quit`.
