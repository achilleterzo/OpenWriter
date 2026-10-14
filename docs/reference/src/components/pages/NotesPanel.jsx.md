# NotesPanel.jsx

Source: [`src/components/NotesPanel.jsx`](../../../../../src/components/NotesPanel.jsx)

Anchored notes of the active document: create, edit, apply, close and delete, with a search field and a filter on the state (open, accepted, rejected, resolved; the selected note is always kept in the list).

- Every card shows the kind (comment or suggestion), the author (assistant or user) and the status, the quoted passage, the note text and, for a suggestion, the proposed replacement; selecting a card also selects the passage in the editor, and clicking a note in the text scrolls the list to it.
- A note is flagged when its quoted text can no longer be found in the document: a button then asks the assistant to check whether the note still applies (to archive it) or to realign it to the current text, and a comment can be turned into the correction the assistant writes; both requests go through `onAskAi` and are answered through the note tools.
- Applying a correction writes the text in place of the quotation through [editorInsert.js](../../lib/editorInsert.js.md) (undoable with Ctrl+Z) and records the note as accepted; a comment that receives a correction becomes an accepted suggestion, so a trace of what was written remains.
- The notes created by the assistant appear with the same controls, and the panel reports through `onStatus` what it does.

Without a project, or for a document not saved as Markdown inside it, the panel explains that notes need a project.