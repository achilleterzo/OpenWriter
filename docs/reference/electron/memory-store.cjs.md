# electron/memory-store.cjs

Project memory persistence in `.ow/memory.json`.

## Data model

Stores an array of entries with these fields:

- `id`: UUID.
- `title`: optional title, limited to 120 characters.
- `text`: required memory text, limited to 4,000 characters.
- `files`: project-relative paths associated with the entry, limited to 20 paths.
- `author`: `ai` or `user`; defaults to `user`.
- `createdAt` and `updatedAt`: ISO timestamps.

Paths use forward slashes, cannot leave the project or reference `.ow`, and duplicate paths are removed.

## Operations

- `list()`: returns all entries.
- `add({ title, text, files, author })`: adds an entry; at most 300 entries are allowed.
- `update(id, changes)`: updates the title, text, or associated files.
- `remove(id)`: removes an entry and returns whether it existed.
- `renameFile(from, to)`: updates exact and nested file references after a file or folder is moved or renamed.

The store creates `.ow` when writing and treats a missing `memory.json` as an empty memory. Invalid JSON raises an error.