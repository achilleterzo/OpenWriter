# pathCompare.js

Source: [`src/lib/pathCompare.js`](../../../src/lib/pathCompare.js)

Path comparison in the interface, with the same rule as [path-compare.cjs](../../electron/path-compare.cjs.md): case matters on Linux, not on Windows and macOS. Paths arrive with `\` or `/` and are compared with `/`.

- `CASE_INSENSITIVE`, `normalizeSeparators(value)`, `pathKey(value)`: the comparable form.
- `samePath(left, right)`: the same file.
- `isInsidePath(target, root)`: `target` lies under `root` (it does not coincide with it).

Used by the workspace (open tabs, deleted and renamed paths), the project lists, the image paths ([imagePaths.js](imagePaths.js.md)), the assistant tools and the links between documents ([bookmarkLinks.js](bookmarkLinks.js.md)).
