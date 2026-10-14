# AiChatPanel.jsx

Source: [`src/components/AiChatPanel.jsx`](../../../../../src/components/AiChatPanel.jsx)

Assistant side panel. Largest UI component of the app.

- Conversation threads: list, create, rename, delete, and branching (`parentId`, `branchedAt`, and `contextFrom` links to previous conversations).
- Message composer with the active document and pinned open documents as chat context, image attachments, and the quick actions (by default proofread, rewrite, summarize, lengthen, review — see [quickActions.js](../../lib/quickActions.js.md)).
- User attachments (paperclip, paste, drag and drop; up to 10 per message): only formats the active model reads natively, images when it has vision and PDF files when it has the `pdf` capability (see [chatAttachments.js](../../lib/chatAttachments.js.md)). They are saved in `.ow/chat/attachments/`; only the most recent ones (8 images, 4 PDFs) are re-sent to the model, the others stay as a text note.
- Token usage: each assistant reply shows its input/output tokens (summing every request of the step), and the header shows the conversation total.
- Writing skills: chips for the skills active in the conversation (project defaults plus the ones added here; × removes one), a selector to add more, the skills' quick actions next to the built-in ones, and "Create a writing skill" from the conversation, the selection, the open document or a pasted text. The active skills are re-read at every step and injected into the system prompt after the project instructions.
- Streaming responses with text, reasoning, and status events; requests can be cancelled.
- Tool loop: parses the fenced `<tool_call>…` blocks emitted by CLI providers, executes the requested tool through the bridge (project reading, file creation, moves and deletes, notes, editor edits, web browsing, screenshots, questions), sends back tool results, and enforces the configured maximum of chained tool steps.
- Renders notes with accept/reject controls and applies editor edits through the editor with undo support.

The model is chosen with [ModelPicker.jsx](ModelPicker.jsx.md) (search by name, filter by accepted input).