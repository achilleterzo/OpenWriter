---

# svgIcon.js

Source: [`src/lib/svgIcon.js`](../../../../src/lib/svgIcon.js)

SVG project icons in the Home graph. An SVG with only a `viewBox` (no `width` and `height`) has no size of its own: for a canvas, `naturalWidth` is 0 or a default (150 or 300 wide), so the central-square crop of the atlas ([graphRenderer.js](graphRenderer.js.md), `drawCell`) took the wrong part of the image, enlarged. The `<img>` of the projects list, instead, fits it to its box.

`sizedSvg(text, side = 256)` returns the SVG text with explicit `width` and `height` (longest side = `side`) in the aspect ratio of the original (from `viewBox`, or from `width`/`height`; a `viewBox` is added when there was only a size) and removes the previous sizes. A text that is not an SVG is returned as it is. `sizedSvgUrl(url)` does it for an `image/svg+xml` data URL and leaves any other URL, or an error, as it was. [ProjectGraph.jsx](../components/pages/ProjectGraph.jsx.md) uses it before loading each icon.
