# bookmarkExtension.js

Source: [`src/lib/bookmarkExtension.js`](../../../../src/lib/bookmarkExtension.js)

Tiptap extension (`Bookmarks`) showing the bookmarks of the open document in the text without modifying it: only decorations — a bookmark icon at the start of the anchored point and an underline over the quoted range, with the `ow-bookmark-marker`/`ow-bookmark-range` classes and a `data-bookmark-id` attribute. A flagged bookmark is drawn in a different colour, and the selected one has the `ow-bookmark-active` class.

The anchor is located with [anchoring.js](anchoring.js.md) (`buildTextIndex` and `locateQuote`), so a bookmark survives edits elsewhere in the document; a bookmark whose text has disappeared is simply not drawn. The icon's tooltip shows the label (or `#name`) and the note.

`setBookmarks(editor, bookmarks, activeId)` pushes the list into the plugin state (`bookmarkKey`), recomputing the decorations. Clicking a marker calls the extension's `onSelect` with the bookmark id.