# NotesPanel.jsx

Source: [`src/components/NotesPanel.jsx`](../../../../../src/components/NotesPanel.jsx)

Anchored notes of the active document: create, edit, apply, close and delete, with a search field and a filter on the state.

- A note written by hand is anchored to the selected text (the final space of a double click is trimmed away, so that a correction does not delete it); the text of the note is required. For the assistant to work on a passage, the chat is the right place, since it already has the selection.
- The filter chooses which notes are shown in the list and in the text: open, all, only the ones written by the user, or none (the selected note is always shown). A counter gives the number of open notes, and a search field filters by text.
- The list is ordered: first the open notes whose text is still in the document, by position; then the closed ones (resolved, accepted, rejected), also by position; last the ones whose text has disappeared, open ones first and then by creation date. Each card shows the author (assistant or user), the kind and status, the quoted passage, the note text, a "revised" mark when it was changed, and the reason given when it was closed without being applied. The quotation and the proposed replacement are drawn with their inline formatting by [InlineMarkdown.jsx](InlineMarkdown.jsx.md), so they read as they do in the document instead of showing the asterisks.
- A note whose quoted text can no longer be found is flagged as "text modified": a button then asks the assistant to check whether the note still applies (to archive it, with a short reason) or to realign it to the current text; a comment can also be turned into the correction the assistant writes.
- Applying a correction writes the text in place of the quotation through [editorInsert.js](../../lib/editorInsert.js.md) (undoable with Ctrl+Z) and records the note as accepted; a comment that receives a correction becomes an accepted suggestion, so a trace of what was written remains.
- Closing a note without applying it asks for an optional reason, which is saved with it. The notes created by the assistant appear with the same controls, and the panel reports through `onStatus` what it does.

Without a project, or for a document not saved as Markdown inside it, the panel explains that notes need a project.