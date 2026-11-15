# electron/document-owners.cjs

Source: [`electron/document-owners.cjs`](../../../electron/document-owners.cjs)

Which window is editing which document. A document is edited in **one window at a time**; the other windows that have it open show it read-only and follow what is saved ([Core and windows](../../design/core-and-windows.md), step 6).

- `createDocumentOwners({ events })` returns the registry. A document is identified by its resolved path (lower-cased on Windows, so another spelling is the same document).
- `setHeld({ sender, paths })` is how a window says which documents it wants to edit: the whole set, not single opens and closes. What it held before and no longer lists is released (a lost message cannot leave a document locked); each path that nobody holds becomes its own; the others come back as `{ refused: [paths] }`. A window that asks again for what it already holds changes nothing and sends nothing. At most 500 paths are taken.
- When a document is released, the other windows get `documents:released` `{ path }`, so the one that was refused can ask again. When the page that held documents is destroyed (window closed, process lost) they are all released.
- `focusOwner(path)` brings the owner's window to the front (restores it if minimised) and sends it `documents:reveal` `{ path }` so it shows the tab. It returns `false` when nobody holds the document.
- `ownerOf(path)` is the page that holds it, or `null`; `count()` the documents held.
