---

# PanelResizer.jsx

Source: [`src/components/PanelResizer.jsx`](../../../../../src/components/PanelResizer.jsx)

Handle for resizing a side panel in width, placed inside the panel (which must be `relative`). `side` is the side the panel is on: `left` (handle on the right edge) or `right`. Dragging works with the mouse even above browser tabs, thanks to the pointer capture.

Keyboard: the arrow keys move the width by 16 px (Shift makes the step four times larger), Home goes to the minimum, End to the maximum; a double click restores `defaultWidth`. It is exposed as a vertical separator with the current, minimum and maximum width, and every change goes through `onChange` (live) and `onCommit` (on release or key press, when the width is saved).