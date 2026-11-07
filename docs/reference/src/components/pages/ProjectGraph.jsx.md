---

# ProjectGraph.jsx

Source: [`src/components/ProjectGraph.jsx`](../../../../../src/components/ProjectGraph.jsx)

The network of the projects: one bubble with the project icon for each project, curved synapses between the ones close in meaning, free bubbles floating for the others ([graphLayout.js](../../lib/graphLayout.js.md) moves them, [graphRenderer.js](../../lib/graphRenderer.js.md) draws them). Props: `graph` (`{ nodes, edges }` from the main process, `projects:graph`), `matches` (a Map of project path → passages found, or null: the bubbles with results glow and the others fade), `activePath` (the open project, slightly lit) and `onOpen(path)`. The pointer drags a bubble, moves the space (drag on the background), zooms (wheel, around the pointer), opens a project (click) and resets the view (double click on the background); hovering lights a bubble and its neighbours and shows its details at the bottom. The names are HTML buttons over the canvas, so they can be reached with the keyboard (focus lights the bubble, Enter opens it). With `prefers-reduced-motion` the layout is computed once and frozen. The drawing loop stops while the Home is hidden. Without WebGL2 it shows a plain grid of avatars.

The project names are labels (`.graph-label` in `styles.css`) that follow the theme of the app although the network has a fixed dark background: light with dark text in the light theme, dark with light text in the dark theme (`--label-bg`, `--label-fg`, `--label-border`, which `.home-dark` does not redeclare), so the contrast stays high. The open project has a bold name and an accent border; a project without index has a softer text.

The icons follow the changes of the project icon: when the user picks or removes one (project settings), the network listens (`onProjectIconsChanged` in [projectIcons.js](../../lib/projectIcons.js.md)) and rebuilds its icon atlas, also while the Home is hidden. Overlapping reloads (two icons changed in a row) apply only the latest one; a removed icon goes back to the initial.

**Labels and satellites.** Project names show only under the pointer (or with keyboard focus): the other labels stay hidden. A project inside the folder of another project of the list (`parent`, from `projects:graph`) is a smaller satellite that orbits its parent, tied to it by a short dashed thread in the accent colour; it has no affinity synapses of its own. Bubble size and relief come from the project's weight (`weightOf`: indexed files on a logarithmic scale).

**Animated icons.** A project icon that is a GIF or animated WebP moves in the graph: its frames are decoded ([animatedIcon.js](../../lib/animatedIcon.js.md)) and the frame is chosen by time in the draw loop, uploading only the changed cells. Not with "reduce motion" (the first frame stays). Without `ImageDecoder` the image stays in the page, invisible, and its current frame is copied about 12 times a second.

**Right click.** A right click on a bubble calls `onContext(path, x, y)` (the browser menu never shows over the graph); on the background nothing happens.

SVG icons are given an explicit size before loading ([svgIcon.js](../../lib/svgIcon.js.md)), so the graph frames them exactly like the avatar of the list.
