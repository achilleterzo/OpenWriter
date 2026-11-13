# electron/mcp-service.cjs

Source: [`electron/mcp-service.cjs`](../../../electron/mcp-service.cjs)

The MCP client as the assistant sees it: it joins the store ([mcp-servers-store.cjs](mcp-servers-store.cjs.md)) and the client ([mcp-client.cjs](mcp-client.cjs.md)).

`createMcpService({ store, client, confirm })`:

- `tools(project)`: what the model is offered, `{ tools, problems }`. Only servers in use with at least one tool switched on are looked at; one that is not confirmed, has no credentials or fails to start goes to `problems` and does not stop the others. Tools are named `service__tool` (the service name as letters, digits and `_`, 20 characters at most, the whole name 64 at most, made unique on a clash), described as `[service] description`, limited to 30 per server and to the ones the user switched on; a schema over 6000 characters is replaced by a plain object. Listings are kept for 5 minutes per connection.
- `call(project, name, args)`: runs one of the tools offered. It asks `confirm` first when the server is set to "ask every time" or the tool does not declare `readOnlyHint` (`needsConfirmation`); a refusal is an error that tells the model not to insist. The text is cut at 20000 characters, and a tool error becomes an exception.
- `test(project, id)`: connects and lists the tools of a server for the settings; a project server that is not confirmed is refused.
- `signIn(project, id)` / `signOut(project, id)`: OAuth access for a service ([mcp-oauth.cjs](mcp-oauth.cjs.md)); the browser is opened with `openExternal`, and the tokens are saved encrypted. Before every request the access token is renewed when it is about to expire (one renewal at a time per service); a refresh the service rejects signs the service out and says to sign in again.
- `forget(key)` drops a connection after the server was edited or removed; `closeAll()`.

In `main.cjs` the `confirm` is a native dialog (service, tool, the arguments in full) shown by the main process, so the interface cannot skip it. The renderer side is in [aiTools.js](../src/lib/aiTools.js.md) (`mcpTools`, `callMcp`).
