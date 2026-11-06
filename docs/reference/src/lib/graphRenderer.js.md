---

# graphRenderer.js

Source: [`src/lib/graphRenderer.js`](../../../../src/lib/graphRenderer.js)

The drawing of the Home network in WebGL2, without libraries. `createGraphRenderer(canvas)` returns `{ setIcons, draw, resize, dispose }`. The bubbles are instanced squares: the icon comes from a texture atlas (one 128 px cell per project, built on a 2D canvas: the project icon, or a gradient with the initial when it has none), and the shader makes the circle, the border and the glow (the free bubbles slowly breathe, the highlighted ones glow). The connections are instanced ribbons along a quadratic curve, with a luminous pulse that runs along the line (the stronger the connection, the faster and brighter). The canvas is transparent and premultiplied, so the app background shows through; the colours come from the CSS variables of the theme (`cssColor`). `webglAvailable()` tells whether WebGL2 exists (otherwise [ProjectGraph.jsx](../components/pages/ProjectGraph.jsx.md) shows a plain grid). The labels are not drawn here: they are HTML over the canvas.

Behind everything the renderer draws a backdrop with depth, in neutral greys that do not depend on the theme: a sky that lightens towards the horizon, a floor plane with a perspective grid that dissolves into the haze, a soft glow along the horizon (sky and floor share the same grey there, so there is no hard line) and darker edges. The grid drifts slowly and moves a little when the view is panned (parallax); with reduced motion it stays still (`frame.still`).
