# electron/bookmarks-store.cjs

Source: [`electron/bookmarks-store.cjs`](../../../electron/bookmarks-store.cjs)

Bookmarks: named anchors in a document, to go back to them, to link them from other documents (`file.md#name`) and to point something out to the assistant. They are saved outside the Markdown file, like notes, in `<project>/.ow/bookmarks/<document path>.json` as `[{ id, name, label, quote, prefix, suffix, note, flagged, author, createdAt, updatedAt }]`.

`name` is the name used in links (lower case, no spaces, unique per document, derived with `slugify` from the wanted name, the label or the quote); `quote`, `prefix` and `suffix` anchor the bookmark to the text so that it survives edits; `flagged` marks it for the assistant; `note` is an optional remark, for the user or for the assistant. A document belongs to its nearest `.ow`, as for notes ([project-owner.cjs](project-owner.cjs.md)), and a document outside the project goes to the main project under `loose/`. Limit: 500 bookmarks per document.

- `list(document)` / `add(document, input)` / `update(document, id, changes)` / `remove(document, id)`: the bookmarks of one document. Adding requires a `quote`; updating changes label, note, flag, name and, to realign the bookmark after an edit, the anchor. Writing the last bookmark away removes the file.
- `listAll()`: every bookmark of the project, sub-projects included, as `[{ path, absolute, bookmarks }]`.
- `move(from, to)`: follows a renamed or moved document or folder, copying across filesystems when needed, so bookmarks are never orphaned.

Writes go through [atomic-write.cjs](atomic-write.cjs.md); malformed JSON raises instead of wiping user data. The module also exports `slugify`.