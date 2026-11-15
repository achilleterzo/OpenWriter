# electron/layout-merge.cjs

Source: [`electron/layout-merge.cjs`](../../../electron/layout-merge.cjs)

The merge of bubble positions into the remembered arrangement of a workspace, done by the core. It is the same merge as `saveLayout` in [graphLayoutStore.js](../src/lib/graphLayoutStore.js.md), moved here so that no window reads the whole arrangement, merges and writes it back by itself: two windows saving together used to overwrite each other, because each wrote the full value it had read.

- `mergeLayout(raw, nodes, limit = LAYOUT_LIMIT)` takes the stored value (JSON text or `null`) and `[{ id, x, y, z }]`, and returns the new JSON text. Unreadable data counts as empty; a node without a string `id` or finite `x` and `y` is skipped; at most 2000 nodes are taken from one call.
- The positions of the nodes are written again at the end, so the ones that have not moved for longest are the first to fall when `LAYOUT_LIMIT` (400) is exceeded. Coordinates are rounded to a tenth of a pixel.
- `main.cjs` calls it from the `layout:merge` channel under `changeLayoutStore`, which reads, changes and writes the file in one synchronous step, then tells the other windows (`layout:changed`).
