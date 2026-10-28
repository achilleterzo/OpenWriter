# electron/document-images.cjs

Source: [`electron/document-images.cjs`](../../../electron/document-images.cjs)

The images of a document that live next to it, in its `images/` folder, follow it when the document is moved to another folder. The work is split in two: `planImageMove` before the move (if anything is wrong the move does not start) and `applyImageMove` after it.

- `planImageMove(source, destination, { scanRoot, extraDocuments })`: the images to carry along, as `[{ from, to, copy, keep }]`. Nothing is planned when the file is not Markdown or stays in the same folder. The document is read through the Markdown tokens ([markdown-images.cjs](markdown-images.cjs.md)): destinations with parentheses, escapes or `<…>` are read whole, and examples in code are not images. Only the images in the document's own `images/` folder follow it. An image another document still uses must not be removed from its place: every Markdown file under `scanRoot` (the project folder; hidden folders and `node_modules` excluded) and every document in `extraDocuments` (the linked documents) is checked, whatever its folder; if the check cannot be completed (an unreadable file, a project too big to scan) the image is kept: when in doubt, copy. It throws when the destination already holds a different image with the same name: better not to move than to overwrite it or make the document point to the wrong one.
- `applyImageMove(plan)`: copies the images into the new folder and removes from the old one those that no other document uses (shared images stay where they were and are copied); an empty old `images/` folder is removed. An error here does not fail the move that already happened.

