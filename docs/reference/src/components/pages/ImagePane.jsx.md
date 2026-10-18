# ImagePane.jsx

Source: [`src/components/ImagePane.jsx`](../../../../../src/components/ImagePane.jsx)

Read-only tab showing an image of the project: the wheel zooms around the pointer, dragging with the left button moves the image, and a double click switches between "fit to window" and "actual size". Like the browser tab it has no editor; the assistant sees it with `view_image` on the image path.

- The bar shows the file name, the size in pixels, the weight and the date, the position among the images of the same folder (`3 / 8`), the zoom controls and a button to reveal the file in the file manager.
- The other images of the same folder are loaded as a list, in the order of the file tree: the arrows (or the buttons at the sides, drawn with an outline so they stay visible on any picture) move from one to the next in the same tab, and the two neighbours are preloaded so the change is immediate. The keyboard works too: the arrows, Page Up/Down and Home/End, when no modifier is held.
- The image follows the window while it is fitted (`fit`), and switches to free once it is zoomed or moved; the pan is constrained so the image does not leave the stage, and above 400% zoom the pixels are shown without smoothing.

A file that cannot be read says so instead of showing a broken image.