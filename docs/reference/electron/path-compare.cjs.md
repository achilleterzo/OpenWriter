# electron/path-compare.cjs

Source: [`electron/path-compare.cjs`](../../electron/path-compare.cjs)

Comparison of paths, in one place. On Windows and macOS (file systems normally insensitive to case) two paths that differ only by case are the same file; on Linux they are not: `Docs` and `docs` are different folders, and confusing them would authorise, or move, the wrong file. It is used wherever the code decides whether two paths coincide or one is inside the other — project, links, references, images, bookmarks, the MCP access model — instead of scattered `toLowerCase()`.

- `CASE_INSENSITIVE`: `true` on Windows and macOS.
- `pathKey(path)`: absolute, normalised and, where needed, lower case form.
- `samePath(a, b)`: the same file.
- `isSameOrInside(root, target)`: `target` is `root` or lies under it.

The interface has its twin in [pathCompare.js](../src/lib/pathCompare.js.md).
