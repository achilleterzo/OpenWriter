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

**Updates without a restart.** The renderer, the simulation, the camera, and the listeners are created once (the effect depends only on WebGL support). When `graph` changes (the index is working and the Home reads it again every few seconds), `applyGraph` updates the running simulation: known bubbles keep their position and speed, new ones enter, and the synapses change through the springs, so nothing jumps. The icon atlas is rebuilt only when the list of projects or their names change, not at every change of weight. With "reduce motion" the network is frozen and is recomposed once after a change.

**Volume and mass.** The network is not flat: every bubble has a depth `z`, and the simulation ([graphLayout.js](../../lib/graphLayout.js.md)) gives it a mass from what the project holds (the weight from its indexed files, the same that sizes the bubble) and from its connections. A heavy project is inert (springs and repulsion move it little, they are divided by its inertia), sits near the central plane and drags the lighter ones it is linked to, like a celestial body; the light ones spread in depth around it. Satellites keep the depth of their parent. In the default view the depth is visible through the perspective (near bubbles are a little larger, far ones smaller and dimmer).

**Rotation in space.** Dragging with the right button on the background turns the network in space ([graphProjection.js](../../lib/graphProjection.js.md)): left and right turn it around the vertical axis (Y, yaw), up and down around the horizontal one (X, pitch), without limits (a full turn on either axis is possible; the angles are kept modulo 2π), and the volume shows. The shown tilt follows the wanted one smoothly. The near bubbles are drawn over the others and the icons always face the viewer. A right click on a bubble still opens the project menu. The bubble under the pointer is found on the projected positions (the nearest to the viewer wins) and a dragged bubble is moved on the plane of its own depth with the inverse projection. Double-clicking the background resets pan, zoom, and tilt (the tilt returns smoothly, by the shortest way).

**A stable network.** The graph does not rebuild itself: the positions of the bubbles are remembered between launches ([graphLayoutStore.js](../../lib/graphLayoutStore.js.md), in the app's `localStorage`) and the simulation has no drift and no orbit spin (`wander: false`). It works only after an event and then falls asleep:

- **A new project** finds its place among the others, which stay fixed while it does, and then the network is remembered.
- **Moving a bubble** lets the others settle around it for a few seconds (more slowly if they are heavy, see mass above) and then the network is remembered; with "reduce motion" it settles at once.
- **The translucent button at the bottom left** (Recalculate the layout) forgets everything and recomposes the network from scratch, with a movement that then stops.

Reading the graph again (reindexing, new synapses, other weights) changes nothing in the positions. A project that is removed leaves the rest as it is. Remembered positions are kept for the last 400 projects.

**Satellites keep orbiting.** The stable network has no drift, but the sub-projects still turn around their parent: `sim.orbit(dt)` ([graphLayout.js](../../lib/graphLayout.js.md)) is called every frame (not with "reduce motion") and only advances the satellites on their orbit, from parents to children, at the depth of the parent. It moves nothing else, so the remembered arrangement is not affected; a remembered satellite resumes from the angle where it was.
