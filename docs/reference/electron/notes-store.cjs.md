# electron/notes-store.cjs

Source: [`electron/notes-store.cjs`](../../electron/notes-store.cjs)

Anchored note store under `.ow/notes/`. For each document, notes live in a JSON file mirroring the project path: `.ow/notes/<document-path>.json`.

Field limits: `quote` 2,000 chars, `prefix`/`suffix` 80, `body` 4,000, `replacement` 4,000 (only for suggestions). A note has `kind` (`comment` or `suggestion`), `status` (`open`, `accepted`, `rejected`, `resolved`) with `resolvedAt` bookkeeping, and `author` (`ai` or `user`); `createdAt` is set on creation, `updatedAt` on changes. Corrupt JSON raises instead of wiping user data; writes are atomic (temp file + rename).

Operations:

- `list(document)`: notes of one document.
- `listAll()`: all project notes as `[{ path, notes }]`.
- `add(document, input)`: requires a `quote` anchor; new notes are open.
- `update(document, id, changes)`: changes body, replacement (a comment becomes a suggestion), status, kind, and the anchor (`quote`/`prefix`/`suffix`) after text edits; the author is immutable.
- `remove(document, id)`: deletes one note, removing the file when the last note goes.
- `move(from, to)`: follows a renamed or moved document or folder (file and sibling directory), so notes are never orphaned.

