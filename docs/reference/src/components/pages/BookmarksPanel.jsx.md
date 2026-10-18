# BookmarksPanel.jsx

Source: [`src/components/BookmarksPanel.jsx`](../../../../../src/components/BookmarksPanel.jsx)

Bookmarks panel of the active document, on [bookmarks-store.cjs](../../../electron/bookmarks-store.cjs.md): named points kept outside the Markdown file.

- Two scopes: **This document** and **Whole project** (grouped by document, read through `listAllBookmarks`).
- A new bookmark is anchored to the selected text or, without a selection, to the start of the paragraph the cursor is in; it takes an optional name (the link name is derived from it, from the label or from the quote), an optional note and the flag that points it out to the assistant.
- The cards are listed in document order, with the ones whose anchored text has disappeared at the end and dimmed, saying so. Each card shows the label (or `#name`), the link name, the quoted passage and the note; its buttons copy the link (`file.md#name`), insert a link at the cursor (relative to the current document when the bookmark belongs to another one, through [bookmarkLinks.js](../../lib/bookmarkLinks.js)), toggle the flag, ask the assistant about that point, edit label, name and note, and delete.
- Selecting a card selects the passage in the editor and highlights the bookmark; creating or changing one refreshes the markers shown in the text by [bookmarkExtension.js](../../lib/bookmarkExtension.js.md).

Without a project, or for a document not saved as Markdown inside it, the panel explains that bookmarks need a project.
