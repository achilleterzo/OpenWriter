# svgRaster.js

Source: [`src/lib/svgRaster.js`](../../../../src/lib/svgRaster.js)

Turns an SVG into a PNG for the chat, because models read pixels, not vectors. An SVG attached to a message is rasterised before it is sent; the image is loaded as an image (so the scripts and external resources of the SVG never run), drawn on a white canvas (a dark drawing on a transparent background would be unreadable) and scaled so that its longest side is at least `minSide` pixels — small icons would otherwise arrive as a few unreadable dots — and never beyond `maxSide`.

- `rasterizeSvg(base64, { minSide = 768, maxSide = 1600 })`: returns a promise of `{ mime, data, width, height }`, the same shape as every attachment of the chat ([chatAttachments.js](chatAttachments.js.md)), produced by `prepareImage`.
- The natural size of the SVG is used when the image reports one (`naturalWidth`/`naturalHeight`), otherwise 300×150; the scale is the smaller of `maxSide / longest` and the one that brings the longest side up to `minSide` (never below 1, so an image is not shrunk below its own size to reach the minimum).
- The canvas is filled white before drawing (`#ffffff`), and the PNG data comes from `canvas.toBlob(…, 'image/png')` read back as base64 with a `FileReader`.
- Errors: an SVG that cannot be loaded throws "The SVG could not be read"; a canvas that produces no blob throws "The SVG could not be converted".
