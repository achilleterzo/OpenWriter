# AiChatPanel.jsx

Source: [`src/components/AiChatPanel.jsx`](../../../../../src/components/AiChatPanel.jsx)

Assistant side panel. Largest UI component of the app.

- Conversation threads: list, create, rename, delete, and branching (`parentId`, `branchedAt`, and `contextFrom` links to previous conversations).
- Message composer with the active document and pinned open documents as chat context, image attachments, and quick actions (proofread, rewrite, summarize, review).
- Streaming responses with text, reasoning, and status events; requests can be cancelled.
- Tool loop: parses the fenced `<tool_call>…` blocks emitted by CLI providers, executes the requested tool through the bridge (project reading, file creation, moves and deletes, notes, editor edits, web browsing, screenshots, questions), sends back tool results, and enforces the configured maximum of chained tool steps.
- Renders notes with accept/reject controls and applies editor edits through the editor with undo support.