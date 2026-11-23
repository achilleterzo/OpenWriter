# src/lib/textFormat.js

Source: [`src/lib/textFormat.js`](../../../../src/lib/textFormat.js)

The renderer side of the Unicode text style menu of the text reader ([TextPane.jsx](../components/pages/TextPane.jsx.md)); the formatting itself is [unicode-text.cjs](../../../electron/unicode-text.cjs.md), reached through `electronAPI.textFormat`.

- `styleName(id)`: the translated name of a style as the menu shows it (the identifiers are those of `styleMenu()`, which gives the list and its order).
- `describeLoss(ids)`: the codes of `lost` of a conversion in words (heading levels, code languages, images, tables, HTML, footnotes, formulas, front matter, styles on letters that have none, indentation, link titles; `style:x` gives the name of the style).
- `replaceInTextarea(textarea, from, to, replacement)`: replaces a stretch of a text field as if the user typed it, so that Ctrl+Z undoes it (assigning the value would clear the history), and leaves the new text selected. It returns false when the browser does not allow it, and the caller changes the text itself.
