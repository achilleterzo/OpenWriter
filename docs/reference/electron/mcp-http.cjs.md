# electron/mcp-http.cjs

Source: [`electron/mcp-http.cjs`](../../../electron/mcp-http.cjs)

The HTTP transport of the MCP server, for the clients that cannot start a program of their own. The application starts it as a child process, and only if the user turns it on in Settings → Agents (MCP): it runs the same server script ([mcp-server.cjs](mcp-server.cjs.md)) with `--http`, so the tools and the access rules are exactly the same.

The server listens only on `127.0.0.1`, on a port kept in `mcp-http.json` in the application data together with a token (the file is readable by the user only, like the one of the bridge). Port and token stay the same between launches, so the client configuration does not have to change, and the token can be regenerated from the settings; every request must carry it as `Authorization: Bearer …`. With the read-only switch the child process is started with `--read-only`.

`start({ readOnly, renewToken })` stops any previous child, makes sure the state file exists (a free port is probed, the token is generated or renewed), and spawns the server — through the Electron executable with `ELECTRON_RUN_AS_NODE` in a packaged build, through `node` in development. It resolves once the child has written that it is listening (or after 5 seconds), and the last error it reported is kept for the interface. `stop()` kills the child; the application calls it when the switch is turned off and on quit. `status()` returns whether the server is running, the last error, and the port, token and full `http://127.0.0.1:<port>/mcp` address once they exist.

The interface does not use this module directly: the main process exposes `mcp:http-status` and `mcp:http-set` ([preload.cjs](preload.cjs.md), [main.cjs](main.cjs.md)), and [McpSettings.jsx](../src/components/pages/McpSettings.jsx.md) shows them.