# electron/notes-store.cjs

Source: [`electron/notes-store.cjs`](../../electron/notes-store.cjs)

Anchored note store under `.ow/notes/`. For each document, notes live in a JSON file mirroring the project path: `.ow/notes/<document-path>.json`.

Each note has kind (`comment` or `suggestion`), an anchored `quote` with `prefix` and `suffix` context for unambiguous relocation, an optional `replacement` for suggestions, status (`open`, `accepted`, `rejected`, `resolved`), and author (`ai` or `user`). Notes are stored outside the Markdown file so the document is never polluted; files and folders follow documents on rename or move.

Operations: list per document, listAll across the project, add, update (author is immutable), remove, move. All writes are atomic and text fields are size-limited.