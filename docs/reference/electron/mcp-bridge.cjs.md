# electron/mcp-bridge.cjs

Source: [`electron/mcp-bridge.cjs`](../../../electron/mcp-bridge.cjs)

The bridge between the MCP server ([mcp-server.cjs](mcp-server.cjs.md), another process started by the agent) and the running application: it is what lets an agent change the documents open in the editor, so that the changes arrive as edits to review (accept/reject) instead of touching the file, and what lets it open a project or a document in the application or hand a task to the built-in assistant.

The application listens only on `127.0.0.1`, on a random port, and writes the port and a token in `mcp-bridge.json` in its data folder (readable by the user only; removed on exit if it is still its own). The MCP server reads that file and calls `POST /call` with the token. Each request goes to the interface (renderer), which runs it ([mcpRequests.js](../src/lib/mcpRequests.js.md)) and answers; requests are served one at a time, so two edits of the same document never overlap.

What it accepts: only the tools in `ALLOWED` (`read_open_document`, `replace_text`, `insert_text`, `replace_document`, `open_document`, `open_project`, `ask_agent`); only for the project open in the application (another project is refused), except `open_project`, which is the tool that changes it and needs no project to be open; only while editing by agents is on (preference `openwriter.mcpEdit`, Settings → Agents (MCP)). It refuses requests with a wrong or missing token (401), with an `Origin` header (a web page) or a `Host` other than its own address (DNS rebinding) (403), and bodies over 8 MB. If the window stops responding, the pending requests fail.

`createMcpBridge({ directory, getWindow, getProjectPath, isEnabled })` returns `{ start, stop, answer, rejectAll, bridgeFile }`.