# ToolbarMenu.jsx

Source: [`src/components/ToolbarMenu.jsx`](../../../../../src/components/ToolbarMenu.jsx)

A toolbar button that opens a small menu of choices with an icon (alignment, list type…). It shows the icon of the current choice next to a chevron, and is highlighted like the other buttons when `active`.

`items` are `[{ value, label, icon, hint }]`; the current one is marked with a check and the accent colour, and the menu is exposed as a `menu` of `menuitemradio` entries. Keyboard: the up and down arrows move between the choices, Enter chooses, Escape closes and returns the focus to the button. A click outside closes it.
