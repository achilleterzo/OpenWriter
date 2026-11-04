---

# electron/knowledge-sync.cjs

Source: [`electron/knowledge-sync.cjs`](../../../electron/knowledge-sync.cjs)

Keeps the search index ([knowledge-index.cjs](knowledge-index.cjs.md)) aligned with the files of a project. It runs inside the worker ([knowledge-worker.cjs](knowledge-worker.cjs.md)) but does not depend on it, so it is tested with an in-memory index and a temporary folder.

It indexes text documents only (`.md`, `.markdown`, `.mdown`, `.txt`), with the limits of the file search: no name starting with `.` (so no `.ow` and no `.git`), no `node_modules` or hidden folders of the explorer, at most 2 MB per file and 20,000 files visited.

- `syncTree(index, project, relativeBase = '', hidden)`: walks `relativeBase` (the whole project by default) and compares size and modification time with what the index knows: only new or changed files are read, files that disappeared are removed. Returns `{ indexed, removed, unchanged }`.
- `syncPaths(index, project, relatives, hidden)`: updates the given paths (relative, with `/`), as reported by the folder watcher. A missing path is removed from the index (file or whole folder); a folder is re-synced as a tree; a file is re-indexed (unchanged text is recognised by its hash). A file renamed to a hidden name or to an unsupported extension leaves the index.

A rename is handled as a removal plus an addition (the new file is read again); `movePath` of the index is not used yet.

Tests: [tests/knowledge-sync.test.cjs](../../../tests/knowledge-sync.test.cjs).
