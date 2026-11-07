
# graphLayoutStore.js

Source: [`src/lib/graphLayoutStore.js`](../../../../src/lib/graphLayoutStore.js)

Remembers where each project sits in the network of the Home between launches, so the network is stable and changes only by events: a new project, a bubble moved by the user, or the explicit recalculation ([ProjectGraph.jsx](../components/pages/ProjectGraph.jsx.md)). It lives in the app's `localStorage` (per user, not in the projects), under `openwriter.graphLayout.v1`.

- `loadLayout(storage?)` → `{ [project path]: { x, y, z } }`, ignoring invalid entries and unreadable data.
- `saveLayout(nodes, storage?)` merges `[{ id, x, y, z }]` into what is remembered (projects not visible now keep their place), rounds to a tenth of a pixel and keeps at most `LAYOUT_LIMIT` (400) projects, dropping the oldest.
- `clearLayout(storage?)` forgets everything.

Every access is protected: with no storage or damaged data the network arranges itself as the first time. Tested in `tests/graph-layout-store.test.cjs`.
