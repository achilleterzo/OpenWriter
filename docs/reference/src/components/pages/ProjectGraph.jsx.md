---

# ProjectGraph.jsx

Source: [`src/components/ProjectGraph.jsx`](../../../../../src/components/ProjectGraph.jsx)

The network of the projects: one bubble with the project icon for each project, curved synapses between the ones close in meaning, free bubbles floating for the others ([graphLayout.js](../../lib/graphLayout.js.md) moves them, [graphRenderer.js](../../lib/graphRenderer.js.md) draws them). Props: `graph` (`{ nodes, edges }` from the main process, `projects:graph`), `matches` (a Map of project path → passages found, or null: the bubbles with results glow and the others fade), `activePath` (the open project, slightly lit) and `onOpen(path)`. The pointer drags a bubble, moves the space (drag on the background), zooms (wheel, around the pointer), opens a project (click) and resets the view (double click on the background); hovering lights a bubble and its neighbours and shows its details at the bottom. The names are HTML buttons over the canvas, so they can be reached with the keyboard (focus lights the bubble, Enter opens it). With `prefers-reduced-motion` the layout is computed once and frozen. The drawing loop stops while the Home is hidden. Without WebGL2 it shows a plain grid of avatars.

The project names are labels (`.graph-label` in `styles.css`) that follow the theme of the app although the network has a fixed dark background: light with dark text in the light theme, dark with light text in the dark theme (`--label-bg`, `--label-fg`, `--label-border`, which `.home-dark` does not redeclare), so the contrast stays high. The open project has a bold name and an accent border; a project without index has a softer text.
