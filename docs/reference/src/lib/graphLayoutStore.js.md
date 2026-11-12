# graphLayoutStore.js

Source: [`src/lib/graphLayoutStore.js`](../../../../src/lib/graphLayoutStore.js)

Remembers where each project sits in the network of the Home between launches, so the network is stable and changes only by events: a new project, a bubble moved by the user, or the explicit recalculation ([ProjectGraph.jsx](../components/pages/ProjectGraph.jsx.md)). It lives in the app's `localStorage` (per user, not in the projects), under `openwriter.graphLayout.v1`, unless `electronAPI.layoutStorage` is there: with more than one window the arrangement must be a single one, so it is kept in `graph-layout.json` in the application data, read and written by the main process ([main.cjs](../../../electron/main.cjs.md), [preload.cjs](../../../electron/preload.cjs.md)), and every window sees the same network. `defaultStorage()` builds that store over the shared one, falling back on the local `localStorage` for a key the file does not have yet, so whoever already had an arrangement finds it again.

- `loadLayout(storage?)` → `{ [project path]: { x, y, z } }`, ignoring invalid entries and unreadable data.
- `saveLayout(nodes, storage?)` merges `[{ id, x, y, z }]` into what is remembered (projects not visible now keep their place), rounds to a tenth of a pixel and keeps at most `LAYOUT_LIMIT` (400) projects, dropping the oldest.
- `clearLayout(storage?)` forgets everything.

Every access is protected: with no storage or damaged data the network arranges itself as the first time. Tested in `tests/graph-layout-store.test.cjs`.

**One arrangement per workspace.** "All" keeps the original key (`openwriter.graphLayout.v1`), every other workspace has its own (`…:<id>`): `loadLayout(storage, workspace)`, `saveLayout(nodes, storage, workspace)`, `clearLayout(storage, workspace)` (the `workspace` argument comes after the optional `storage`, so existing callers are unchanged), `layoutKeyFor(workspace)`. `pruneLayouts(validIds, storage)` removes the arrangements of workspaces that no longer exist and never touches "All" or other keys. Each key keeps at most 400 projects.