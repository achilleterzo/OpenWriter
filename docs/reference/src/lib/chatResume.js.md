
# chatResume.js

Source: [`src/lib/chatResume.js`](../../../../src/lib/chatResume.js)

Resuming an interrupted turn of the built-in assistant. Every step (reply, tool call, tool result) is saved in the conversation as soon as it arrives, so the log always says how far the work got: the resume starts from there instead of from the user's message, and does not redo what is done.

A turn is incomplete, and can be resumed ("Resume from here"), when the last message is:

- the user's (the request got no answer);
- a failed reply (`error`) or one the user interrupted (`interrupted`);
- a reply with a tool call that has no result (stop, or the app closed, while the tool was working);
- the result of a tool that the model has not answered yet.

`canResumeMessages(messages)` says whether it can. `prepareResume(messages)` returns `{ messages, note }`: trailing failed or interrupted replies are dropped (the partial text is generated again), and a tool call left without a result gets one saying that it is not known whether the step finished (`INTERRUPTED_RESULT`), so the model checks the state (re-reads the document or file) before repeating it, since an edit may already have been applied. `note` is true when work had already started: the first request of the resumed run then ends with `RESUME_NOTE`, which tells the model to continue from the last result without redoing the finished steps (the note is not saved in the conversation). Used by [AiChatPanel.jsx](../components/pages/AiChatPanel.jsx.md); tested in `tests/chat-resume.test.cjs`.

Limit: unsaved edits in the editor are not recovered if the application itself stops (the documents the assistant edited are saved at the end of the turn).
