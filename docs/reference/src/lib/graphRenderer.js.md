---

# graphRenderer.js

Source: [`src/lib/graphRenderer.js`](../../../../src/lib/graphRenderer.js)

The drawing of the Home network in WebGL2, without libraries. `createGraphRenderer(canvas)` returns `{ setIcons, draw, resize, dispose }`. The bubbles are instanced squares: the icon comes from a texture atlas (one 128 px cell per project, built on a 2D canvas: the project icon, or a gradient with the initial when it has none), and the shader makes the circle, the border and the glow (the free bubbles slowly breathe, the highlighted ones glow). The connections are instanced ribbons along a quadratic curve, with a luminous pulse that runs along the line (the stronger the connection, the faster and brighter). The canvas is transparent and premultiplied, so the app background shows through; the colours come from the CSS variables of the theme (`cssColor`). `webglAvailable()` tells whether WebGL2 exists (otherwise [ProjectGraph.jsx](../components/pages/ProjectGraph.jsx.md) shows a plain grid). The labels are not drawn here: they are HTML over the canvas.

Behind everything the renderer draws a backdrop with depth, in neutral greys that do not depend on the theme: a sky that lightens towards the horizon, a floor plane with a perspective grid that dissolves into the haze, a soft glow along the horizon (sky and floor share the same grey there, so there is no hard line) and darker edges. The grid drifts slowly and moves a little when the view is panned (parallax); with reduced motion it stays still (`frame.still`).

**Relief.** Each bubble has a `weight` (0–1, from the indexed files of the project): the shader treats the icon as a spherical cap lit from the top left (diffuse shading, a specular highlight, an accent rim light, no magnification: the icon is shown whole and undistorted, like the avatar of the projects list) (no cast shadow). The heavier the project, the stronger the relief; light projects are almost flat.

**Relevance tone.** A node carries a `tone` (0–3): 0 for the accent of the view, 1 red, 2 yellow, 3 green. It is the traffic light of a search, the relevance of the project's best passage ([ProjectGraph.jsx](../components/pages/ProjectGraph.jsx.md)), and the shader uses it for the ring and the glow of a lit bubble (the same colours as the bar of the results), so a project found by a weak passage lights red and one found well lights green.

**Satellite thread.** An edge with a negative `weight`

 is the thread that ties a satellite to its parent: thinner than a synapse, dashed (regular dashes and gaps along the line, no travelling pulse), in the same accent colour, brighter when either end is highlighted.

**Animated icons.** `refreshCells(indices)` redraws only the given cells of the atlas (a cell canvas, `texSubImage2D`) and regenerates the mipmaps, so an animated icon changes frame without rebuilding the whole atlas. An entry's `image` can be an `<img>` (`naturalWidth`) or an already decoded `ImageBitmap` (`width`).

**Initials.** The initial of a project without an icon is centred like the avatar of the projects list ([ProjectIcon.jsx](../components/pages/ProjectIcon.jsx.md)): the interface font, 0.4 of the side, and the centre of the font's text area (ascent and descent from `measureText`) at the centre, as CSS `items-center` does. [ProjectGraph.jsx](../components/pages/ProjectGraph.jsx.md) redraws the atlas when the fonts are ready, so the letters do not stay in the fallback font.

The rim of a bubble is thin (about 3% of the radius, like the border of the avatar in the list) so it does not cover the margins of the icon.

**Depth order.** Synapses and bubbles are drawn together from the farthest to the nearest (painter's algorithm), not all synapses first. Each synapse is cut into `PIECES` (12) pieces, each with its own depth (the interpolation of the depths `az` and `bz` of its ends, in the same units as the `z` of the nodes), so a synapse passes over a bubble that is behind it and under one that is in front, which keeps the sense of volume when the network is turned. A bubble counts from its nearest surface (`z − r`), so the pieces that reach it from its own centre stay behind it; on a tie the synapse goes first. Consecutive items of the same kind are drawn with one instanced call (`PIECE_SEGMENTS` segments per piece), the attribute pointers starting at the first element of the run. The edge shader takes the part of the curve to draw from the attribute `range` (t0 to t1), so the pulse and the dashes stay continuous along the whole synapse. The nodes need `z` and the edges `az` and `bz` in the frame.