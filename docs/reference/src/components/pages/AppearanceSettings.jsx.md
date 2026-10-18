# AppearanceSettings.jsx

Source: [`src/components/AppearanceSettings.jsx`](../../../../../src/components/AppearanceSettings.jsx)

Settings screen section for the appearance, read from and written to [appearance.js](../../appearance.js.md) (with a subscription, so the controls follow the current values).

- **Interface**: the theme as a [Segmented.jsx](Segmented.jsx.md) choice (system, dark, light) and the accent color as round swatches (ash, violet, cyan, emerald, rose, amber), the current one ringed and ticked.
- **Editor**: the font choice ([FontPicker.jsx](FontPicker.jsx.md): system typeface or a Google font, with the note that it only changes how the text looks in the editor and is neither saved in the document nor exported), the text size slider (14–24 px), the line spacing, the text width, and the page layout when the paged view is enabled (it is currently hidden, `pagesViewEnabled`).
- A live preview box shows a heading, a paragraph with a link and a bit of code in the chosen look, and "Restore defaults" brings every value back to `defaultAppearance`.

