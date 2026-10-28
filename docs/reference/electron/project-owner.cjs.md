---

# electron/project-owner.cjs

Source: [`electron/project-owner.cjs`](../../../electron/project-owner.cjs)

The "nearest `.ow`" rule, as with Git: the history and the notes of a file belong to the `.ow` directory nearest to it, walking up from the file's folder to the root of the open project (which is always the last possible owner). A sub-project is therefore a folder with its own `.ow`; the open project never looks beyond its own root.

- `ownerRoot(project, target)`: the owning root of a file. The walk starts from the folder containing the file, so a folder's own `.ow` does not count for the folder itself as an element of its parent.
- `findOwners(project)`: the sub-projects of a project, that is every folder with its own `.ow` at any depth (hidden folders, `node_modules`, `dist` and `out` excluded, 8 levels max), the root excluded.
- `parentOwner(directory)`: the nearest `.ow` above a directory, even outside the open project, used for context inheritance; `null` when there is none.
- `looseKey(target)` and `looseFromKey(key)`: key and absolute path of a loose document (outside the open project). Its history and notes live in the main project's `.ow`, under `loose/`, mirroring the file path with the drive letter or the filesystem root as the first segment (`D:/a/b.md` → `loose/d/a/b.md`); on Windows the key is lower-case, since case does not count there. `looseFromKey` returns `null` when the path cannot be rebuilt (for instance a network root).
- `isInside(root, target)`: whether a path lies inside a folder (the folder itself included), used by the walks above.

Exposed: `ownerRoot`, `findOwners`, `parentOwner`, `isInside`, `looseKey`, `looseFromKey`, `LOOSE_DIRECTORY` (`'loose'`).

