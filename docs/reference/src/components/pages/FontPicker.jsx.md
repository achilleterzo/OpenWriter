# FontPicker.jsx

Source: [`src/components/FontPicker.jsx`](../../../../../src/components/FontPicker.jsx)

Choosing the editor font, based on [fonts.js](../../lib/fonts.js.md) and [fonts.cjs](../../../electron/fonts.cjs.md).

The default export is the Google Fonts part: a grid of cards, two or three per row, with the bundled families and the ones installed from the catalog, each card showing the family name in its own typeface and its category; the chosen one is outlined and ticked, an installed font can be removed (removing the one in use falls back to the sans-serif). A button opens the catalog, with a search field and up to 60 results, an Install button per family and the ones already installed marked; download and error messages are shown in the panel.

`EditorFontChoice` is the complete choice, identical in the general and in the project settings: a [Segmented.jsx](Segmented.jsx.md) group for the system font, then the Google Fonts part. With `allowDefault` it adds a "Default (general settings)" option, for the project override.
