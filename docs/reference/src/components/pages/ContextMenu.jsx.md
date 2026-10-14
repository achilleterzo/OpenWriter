# ContextMenu.jsx

Source: [`src/components/ContextMenu.jsx`](../../../../../src/components/ContextMenu.jsx)

Context menu drawn by the app itself, with square corners and a thin border, in the colours of the theme. It is opened through `ContextMenuContext` (provided by App) by calling `openMenu({ x, y, items })`; each item is `{ label, hint?, bold?, danger?, disabled?, separator?, onClick }`.

The focus stays where it was (the editor or a text field), so Cut / Paste / the spell-check suggestions act on the right element. Keyboard: the arrows move the highlighted item, Home and End go to the first and the last one, Enter or Space runs it, Escape closes. The menu closes when clicking or right-clicking elsewhere, and on blur, resize or scroll, and it is pushed back inside the window when it is opened near an edge.

The module also exports `modKey`, the modifier prefix for the platform (`⌘` on macOS, `Ctrl+` elsewhere).