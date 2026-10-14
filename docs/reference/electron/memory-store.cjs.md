---

# electron/memory-store.cjs

Source: [`electron/memory-store.cjs`](../../electron/memory-store.cjs)

Project memory persistence in `.ow/memory.json`.

## Data model

Stores an array of entries with these fields:

- `id`: UUID.
- `title`: optional title, limited to 120 characters.
- `text`: required memory text, limited to 4,000 characters.
- `files`: paths associated with the entry, limited to 20.
- `author`: `ai` or `user`; defaults to `user`.
- `createdAt` and `updatedAt`: ISO timestamps.

Paths use forward slashes, cannot leave the project or reference `.ow`, and duplicate paths are removed. On disk they are relative to the `.ow` that owns the entry (the nearest one to its files, see [project-owner.cjs](project-owner.cjs.md)), while the store presents them relative to the open project and adds an `origin` field: the owner project path relative to the open one, `''` for the project itself.

## Operations

- `list()`: every entry of the open project and of its sub-projects.
- `add({ title, text, files, author })`: adds an entry to the `.ow` nearest to its files (the open project when it has none, or when they belong to different projects); at most 300 entries (`MAX_ENTRIES`) per store.
- `update(id, changes)`: updates the title, text, or associated files; when the new files belong to another project, the entry moves to that project's memory.
- `remove(id)`: removes an entry and returns whether it existed.
- `relocate(from, to)`: after a file or folder has been moved or renamed (absolute paths, already on disk in the new place), updates the references of the entries concerned; an entry that followed an element which changed project moves, or is duplicated, in the memory of the new project.

The store creates `.ow` when writing and treats a missing `memory.json` as an empty memory. Invalid JSON raises an error instead of discarding the entries.