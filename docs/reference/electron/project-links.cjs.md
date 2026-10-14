---
# electron/project-links.cjs

Source: [`electron/project-links.cjs`](../../electron/project-links.cjs)

Markdown documents linked to a project: files that live outside its folder and that the project points to without copying them. They are listed in `<project>/.ow/links.json` as `[{ path (absolute), addedAt }]`, written atomically, with a maximum of 200 links (`MAX_LINKS`). The original is always the file that is edited: history and notes stay tied to the file's own path, as for any loose document.

- `checkedPaths(project, paths)`: the paths that can be linked, verified as absolute, existing, Markdown files (`md`, `markdown`, `mdown`), outside the project folder, without duplicates.
- `createLinksStore({ getProjectPath })`: store on the open project.
  - `list()`: `[{ path, name, missing }]`; a link whose file has disappeared stays in the list, flagged.
  - `has(target)`: whether the file is already linked.
  - `add(paths)`: links the checked paths, keeping the existing order.
  - `update(from, to)`: points an existing link to another file (moved or renamed original), keeping its position in the list; if the new file was already linked, only the updated entry remains.
  - `remove(target)`: unlinks a file.
- `writeLinksTo(projectDirectory, paths)`: links documents to a project that is not (yet) the open one, so the assistant can create a project already carrying its links.

Malformed `links.json` raises instead of discarding the links; a missing file simply means no links.

