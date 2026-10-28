# electron/notes-store.cjs

Source: [`electron/notes-store.cjs`](../../../electron/notes-store.cjs)

Anchored note store under `.ow/notes/`. For each document, notes live in a JSON file mirroring the project path: `.ow/notes/<document-path>.json`. The file sits in the nearest `.ow` above the document ([project-owner.cjs](project-owner.cjs.md)), so the notes of a sub-project stay in the sub-project; a document outside the open project goes to the main project under `loose/`.

Field limits: `quote` 2,000 chars, `prefix`/`suffix` 80, `body` 4,000, `replacement` 4,000 (only for suggestions), `resolution` 1,000. A note has `kind` (`comment` or `suggestion`), `status` (`open`, `accepted`, `rejected`, `resolved`) with `resolvedAt` bookkeeping, and `author` (`ai` or `user`); `createdAt` is set on creation, `updatedAt` on changes. `resolution` is the free-text reason a note was closed without being applied, cleared if the note is reopened. Corrupt JSON raises instead of wiping user data; writes go through [atomic-write.cjs](atomic-write.cjs.md).

Operations:

- `list(document)`: notes of one document.
- `listAll()`: all project notes, sub-projects included, as `[{ path, absolute, notes }]`.
- `add(document, input)`: requires a `quote` anchor; new notes are open.
- `update(document, id, changes)`: changes body, replacement (a comment becomes a suggestion), status, kind, the `resolution` of a closure, and the anchor (`quote`/`prefix`/`suffix`) after text edits; the author is immutable.
- `remove(document, id)`: deletes one note, removing the file when the last note goes.
- `move(from, to)`: follows a renamed or moved document or folder (file and sibling directory), copying across filesystems when needed, so notes are never orphaned.

