# McpSettings.jsx

Source: [`src/components/McpSettings.jsx`](../../../../../src/components/McpSettings.jsx)

Settings section for the MCP server ([mcp-server.cjs](../../../electron/mcp-server.cjs.md)): it explains what an external agent can do — read the project context, skills, notes, bookmarks and memory, search and read the documents (of the project, the linked ones and those open in OpenWriter), add notes, suggested changes and bookmarks, and change the documents open in the editor with the changes marked for the user to accept or reject; it never writes to the files — and lists the tool names.

A separate "Agent edits" box (preference `openwriter.mcpEdit`) turns the editor edits through the bridge ([mcp-bridge.cjs](../../../electron/mcp-bridge.cjs.md)) on and off at any time, without regenerating the client configuration.

It then gives the configuration to paste into the agent's client, with a choice between **Claude Code** (a terminal command, using `claude.cmd` on Windows because the PowerShell script loses the `--`), **Codex** (`config.toml`), **OpenCode** (`opencode.json`), and the usual `mcpServers` JSON for other clients. Two options change the generated text: read-only, which removes the writing tools, and "Always use this project", which pins the open project with `--project`. Command and arguments come from the application itself; every snippet can be copied with one button, and a development build warns that the command uses the Node.js of the PATH.
