# ImageViewer.jsx

Source: [`src/components/ImageViewer.jsx`](../../../../../src/components/ImageViewer.jsx)

A full-screen viewer for an image of the document, whatever its address (a project file, an embedded base64 image, a remote one): the wheel zooms around the pointer, dragging moves the image, a double click toggles between "fit to window" and "real size", `Escape` closes it — and so does a click on the background, as long as the pointer did not move (dragging a selection out of the image must not close it).

- Props: `src`, `alt` (also the accessible name of the dialog, with "View image" as fallback) and `onClose`.
- The top bar shows the alt text and, once the image is loaded, its natural size, then the zoom out and zoom in buttons (steps of 1.25), the percentage, "Fit to window" and "Close"; the zoom buttons are disabled until the size is known.
- `MIN_SCALE` is 0.05 and `MAX_SCALE` 32. The initial view fits the image in the stage, centred and never enlarged beyond 1 (`fitView`); `zoomAt` keeps the point under the pointer fixed, and `toggle` passes to real size when the view is exactly the fitted one and the fit is smaller than 1.
- The image is drawn with a `transform: translate(…) scale(…)` on a `max-w-none` image, and `imageRendering: pixelated` above a scale of 4, so that an enlarged small icon stays sharp instead of blurry.
- Keyboard: `+`/`=` and `-` zoom around the centre; each handled key is consumed (the focus can still be in the editor underneath, which would otherwise type the character). The dialog takes the focus on mount and gives it back to the previous element on unmount.
- The wheel listener is attached with `{ passive: false }` because it must prevent the scroll of the document below.
- The stage captures the pointer: `onPointerDown` records the start (and whether the gesture began on the background), `onPointerMove` moves the image and marks the gesture as a drag beyond 3 px, `onPointerUp` closes the viewer only for a background click without a drag.
