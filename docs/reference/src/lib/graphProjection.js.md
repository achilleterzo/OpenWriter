
# graphProjection.js

Source: [`src/lib/graphProjection.js`](../../../../src/lib/graphProjection.js)

Perspective projection of the project network in the Home. The network lives in space (x, y, z) and can be turned around the vertical axis (`yaw`, Y) and the horizontal one (`pitch`, X) and looked at from `depth` pixels away (1300 by default). Pure code, no DOM.

`createProjection({ yaw, pitch, depth })` returns:

- `project(x, y, z = 0)` → `{ x, y, z, scale }`: the position on screen (origin at the centre), the depth (positive = farther) and the perspective scale factor. [ProjectGraph.jsx](../components/pages/ProjectGraph.jsx.md) scales the radius of each bubble by `scale` and draws the far ones first.
- `unproject(px, py, z = 0)` → `{ x, y }`: the point of the plane of depth `z` that lands on `(px, py)`, found by solving two linear equations. It gives the bubble under the pointer and the place where a dragged bubble is pinned.

Without rotation both are the identity. Tested in `tests/graph-projection.test.cjs` (identity, round trip for several tilts, which side goes far on each axis).
