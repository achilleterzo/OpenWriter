# mcpRequests.js

Source: [`src/lib/mcpRequests.js`](../../../../src/lib/mcpRequests.js)

The requests that arrive from the MCP server — an external agent, through the bridge of the main process ([mcp-bridge.cjs](../../electron/mcp-bridge.cjs.md)) — are run here, with the same tools as the internal assistant ([aiTools.js](aiTools.js.md)), so with the same rules: the changes stay in the editor, marked for the user to accept or reject, undoable with Ctrl+Z, and nothing is written to the file until the user saves.

`handleMcpRequest({ tool, args }, deps)`:

- `open_project`: opens the given folder in the application before anything else, since it needs no project open and no document; it reports which project was opened and saves the current session first (through `openProject` of the workspace).
- `ask_agent`: starts a chat of the built-in assistant with the prompt as a normal user request (a new chat unless `newChat` is `false`), signed with the `agent` name the caller gives (60 characters at most, "an external agent" by default), through the `askAgent` dependency of [App.jsx](../App.jsx.md). It answers once the message is saved, with the chat id and the index of the message, so the agent can follow the work with the server's `list_chats` / `read_chat`; the answer itself arrives in the app, not to the agent.
- it then checks the document given by the agent (`authorizeDocument`): a project document, a document linked to the project or one already open in the editor, also outside the folder; anything else, or a relative path with `..` or `.ow`, is refused before opening or touching anything;
- `open_document`: a document of the project, or the absolute path of a file outside it, which must be a document (`.md`, `.txt`, `.docx`, `.pdf`): it is the only way for an agent to bring a file into the active workspace, and the user sees it open in a tab;
- `read_open_document`: the text the user sees right now (unsaved changes and edits waiting for review included), in chunks, with the number of edits to review;
- the edit tools: a document that is not open is opened in a tab first; the previous version goes to the history before the edit (at most once a minute per document); when the edit is done the tab of the document comes to the front and the status bar says that an agent proposed changes.

Called from [App.jsx](../App.jsx.md) when the main process forwards a request (`onMcpRequest`), answering with `answerMcp`.