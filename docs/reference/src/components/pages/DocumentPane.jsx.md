# DocumentPane.jsx

Source: [`src/components/DocumentPane.jsx`](../../../../../src/components/DocumentPane.jsx)

Editor surface for one document. Each tab mounts its own Tiptap editor, so undo history and scroll position stay per document; the component is hidden when its tab is not active.

The editor is configured with the content and content type of the tab (Markdown, HTML, or the paragraphs extracted from a PDF), is read-only when `tab.readOnly`, and combines: [imageExtension.js](../../lib/imageExtension.js.md) (sources resolved with [imagePaths.js](../../lib/imagePaths.js.md)), StarterKit, links that open with Ctrl+click (a plain click keeps placing the cursor), headings H1–H7, task lists, the raw-text extensions ([rawMarkdownExtensions.js](../../lib/rawMarkdownExtensions.js.md)), Markdown, [annotationExtension.js](../../lib/annotationExtension.js.md) for note markers and find highlights, [searchExtension.js](../../lib/searchExtension.js.md), [keepSelectionExtension.js](../../lib/keepSelectionExtension.js.md), and [pendingChangesExtension.js](../../lib/pendingChangesExtension.js.md) for the assistant edits to review.

- Dirty tracking: every update marks the tab; after a pause the content is compared with the Markdown at the last save, and a document that has come back to it (an undo) turns clean again.
- Images: picked from disk, pasted from the clipboard, or dropped on the editor; a file outside the project or the document folder is imported first (into the project's `images/`).
- Markdown source view: a text area with the raw Markdown, applied to the editor after a pause in typing (and re-read when the document changes elsewhere, for instance through the assistant), with "Copy all"; notes, the assistant, and find stay on the visual editor.
- Find bar (`Ctrl+F` / `Ctrl+H` or the toolbar button) opens only in the active document, in find or replace mode, and receives the focus on each new request.
- A banner above the editor counts the assistant edits still to review and offers "Accept all" and "Reject all".

A pinned tab whose document was closed shows `ClosedDocumentPane` instead: an icon, the title, the source path, and the button that reopens it.