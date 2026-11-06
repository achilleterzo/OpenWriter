---

# graphLayout.js

Source: [`src/lib/graphLayout.js`](../../../../src/lib/graphLayout.js)

The physics of the Home network, with no DOM. `createGraphSim({ seed, wander })` keeps the bubbles (`setGraph(items, links, bounds)`, which keeps the position of bubbles that were already there) and moves them with `step(dt, { width, height, top })`: repulsion between all bubbles, springs along the connections (the closer in meaning, the shorter), and a light gravity towards the centre for connected ones. A bubble with no connection is tied to nothing: it drifts slowly (`wander`) inside the space and is pushed softly back from the edges and from the top band (`top`, the search bar). `pin`/`release` hold a bubble under the pointer while it is dragged, `nodeAt(x, y, slack)` is the hit test, `settle(steps)` pre-computes the layout and `freeze()` stops everything (used with the system preference for reduced motion). Positions start from a seeded generator, so the same projects open with the same layout. Drawn by [graphRenderer.js](graphRenderer.js.md).
