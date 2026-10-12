# layout.js

Source: [`src/lib/layout.js`](../../../src/lib/layout.js)

Panel layout helper (persisted in `localStorage` as `openwriter.layout`).

- Constants: `ACTIVITY_BAR_WIDTH` 48, `CENTER_MIN` 280; panels `left` (min 180, max 640, default 256) and `right` (min 280, max 900, default 384).
- `loadLayout` / `saveLayout`: stored preferred widths, clamped to the panel ranges.
- `maxWidthFor(side, context)`: how wide a panel may grow, given the window width minus the activity bar and the minimum center space, and the other panel if visible.
- `clampWidth(side, value, context)`: a proposed width clamped to the panel minimum and the dynamic maximum.
- `fitLayout(layout, { windowWidth, leftVisible, rightVisible })`: when the window is too narrow, shrinks the effective widths (right panel first, then left) without dropping below the minimums — saved preferences are untouched, so enlarging the window restores them.

