# electron/projects.cjs

Source: [`electron/projects.cjs`](../../electron/projects.cjs)

Persistent list of known working directories (projects), stored by the main process in the Electron user data directory as `projects.json` as `[{ path, openedAt }]`, most recent first, capped at 100 entries.

- `touch(project)`: registers a project on open/create or moves it back to the top; entries are deduplicated case-insensitively through resolved paths.
- `remove(project)`: drops an entry.
- `list()`: entries with folder-name display, `openedAt`, and a `missing` flag when the folder no longer exists (moved or deleted); missing entries stay in the list until removed there.

