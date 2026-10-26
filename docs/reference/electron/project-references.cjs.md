# electron/project-references.cjs

Source: [`electron/project-references.cjs`](../../../electron/project-references.cjs)

Reference folders of a project: folders outside the project, linked without being copied, which the assistant can only read. They are listed in `<project>/.ow/references.json` as `[{ name, path, addedAt }]`, up to 20.

`name` is the short name the assistant uses to address them (`@name/subfolder/file.md`): unique in the project, derived from the folder name and cleaned of the characters that would confuse a path. A folder that has disappeared stays in the list, flagged as `missing`, and can be pointed to another location keeping the same short name.

- `list()`: `[{ name, path, missing }]`.
- `add(directory)`: links a folder, verified as absolute, existing, not a disk root and neither inside the project nor above it; an already linked folder leaves the list unchanged.
- `update(name, directory)`: points an existing reference to another folder.
- `remove(name)`: unlinks it.
- `resolve(reference)`: `@name/path` → `{ name, root, relative }`, with a clear error when the short name is unknown or its folder is missing; `null` when the path does not start with `@`.
- `get(name)`: the stored entry.

A malformed `references.json` raises instead of discarding the references; writes go through [atomic-write.cjs](atomic-write.cjs.md).