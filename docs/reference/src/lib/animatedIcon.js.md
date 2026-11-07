---

# animatedIcon.js

Source: [`src/lib/animatedIcon.js`](../../../../src/lib/animatedIcon.js)

Animated project icons (GIF, animated WebP) in the Home graph. `decodeAnimatedIcon(url)` decodes the frames once with `ImageDecoder` (WebCodecs, available in Chromium and Electron), crops each to the central square and scales it to 128 px as an `ImageBitmap`, and returns `{ frames: [{ bitmap, duration }], total }` (at most 150 frames; durations in ms, at least 20). It returns `null` if `ImageDecoder` is missing, the image is not animated, or anything fails. `frameAt(animation, ms)` picks the frame to show at a time (looping); `disposeAnimatedIcon(animation)` frees the bitmaps.

The frame is chosen from the clock, not from the browser's own animation of an `<img>`, which stops when the page is hidden and cannot be controlled. [ProjectGraph.jsx](../components/pages/ProjectGraph.jsx.md) uses it; [graphRenderer.js](graphRenderer.js.md) `refreshCells` uploads only the cells that changed.
