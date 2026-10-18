# mcpRequests.js

Source: [`src/lib/mcpRequests.js`](../../../src/lib/mcpRequests.js)

The requests that arrive from the MCP server — an external agent, through the bridge of the main process ([mcp-bridge.cjs](../../electron/mcp-bridge.cjs.md)) — are run here, with the same tools as the internal assistant ([aiTools.js](aiTools.js.md): `replace_text`, `insert_text`, `replace_document`), so with the same rules: the changes stay in the editor, marked for the user to accept or reject, undoable with Ctrl+Z, and nothing is written to the file until the user saves.

`handleMcpRequest({ tool, args }, deps)`:

- first checks the document given by the agent (`authorizeDocument`): a project document, a document linked to the project or one already open in the editor, also outside the folder; anything else, or a relative path with `..` or `.ow`, is refused before opening or touching anything;
- `read_open_document`: the text the user sees right now (unsaved changes and edits waiting for review included), in chunks, with the number of edits to review;
- the edit tools: a document that is not open is opened in a tab first; the previous version goes to the history before the edit (at most once a minute per document); when the edit is done the tab of the document comes to the front and the status bar says that an agent proposed changes.

Called from [App.jsx](../App.jsx.md) when the main process forwards a request (`onMcpRequest`), answering with `answerMcp`.
