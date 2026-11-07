---

# graphLayout.js

Source: [`src/lib/graphLayout.js`](../../../../src/lib/graphLayout.js)

The physics of the Home network, with no DOM. `createGraphSim({ seed, wander })` keeps the bubbles (`setGraph(items, links, bounds)`, which keeps the position of bubbles that were already there) and moves them with `step(dt, { width, height, top })`: repulsion between all bubbles, springs along the connections (the closer in meaning, the shorter), and a light gravity towards the centre for connected ones. A bubble with no connection is tied to nothing: it drifts slowly (`wander`) inside the space and is pushed softly back from the edges and from the top band (`top`, the search bar). `pin`/`release` hold a bubble under the pointer while it is dragged, `nodeAt(x, y, slack)` is the hit test, `settle(steps)` pre-computes the layout and `freeze()` stops everything (used with the system preference for reduced motion). Positions start from a seeded generator, so the same projects open with the same layout. Drawn by [graphRenderer.js](graphRenderer.js.md).

**Sub-projects (satellites).** An item `{ id, r, parent }` whose `parent` is another bubble is a satellite: it orbits its parent at a fixed distance (`parent.r + r + 8`, a second ring after six satellites) with a stiff spring, turning slowly (not when motion is reduced), and starts already in orbit. Bubbles related by parentage at any level (and siblings) do not repel each other, and the parent keeps a `halo` that includes its orbit when it repels other bubbles. A missing parent or a loop (A inside B inside A) leaves the bubbles free. A satellite of a satellite orbits that one.
